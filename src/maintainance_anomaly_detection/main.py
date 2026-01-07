from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import pandas as pd
import io
from .data import load_csv
from .inference import detect_anomalies
from .model import LSTMAutoencoder
from .config import EXAMPLE_DATA, MODEL_CONFIG
import os
import time

# Simple API key protection for sensitive endpoints (set MAINTAINANCE_API_KEY env var)
API_KEY = os.environ.get('MAINTAINANCE_API_KEY')

# Simple rate limiter for `/analyze` (per-key or per-IP)
RATE_LIMIT = {}
RATE_LIMIT_MAX = 60  # requests
RATE_LIMIT_WINDOW = 60  # seconds

def _check_api_key(request: Request):
    if API_KEY is None:
        return True
    # look in header first
    key = request.headers.get('x-api-key')
    if not key:
        # fallback to query param
        key = request.query_params.get('api_key')
    return key == API_KEY

def _rate_limit(key: str):
    now = time.time()
    times = RATE_LIMIT.get(key, [])
    # keep only recent
    times = [t for t in times if now - t < RATE_LIMIT_WINDOW]
    if len(times) >= RATE_LIMIT_MAX:
        return False
    times.append(now)
    RATE_LIMIT[key] = times
    return True

app = FastAPI(title="MaintainceAnomalyDetection")

ROOT = Path(__file__).resolve().parents[2]

app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")

# instantiate default model
model = LSTMAutoencoder(**MODEL_CONFIG)


@app.get("/", response_class=HTMLResponse)
def index():
    index_file = ROOT / "templates" / "index.html"
    return index_file.read_text()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/datasets")
def list_datasets():
    if not EXAMPLE_DATA.exists():
        return {"datasets": []}
    files = [p.name for p in EXAMPLE_DATA.glob("*.csv")]
    return {"datasets": files}


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    df = load_csv(io.BytesIO(content)) if hasattr(df, 'columns') else load_csv(file.filename)
    scores = detect_anomalies(df, model)
    return {"scores": scores}



@app.post('/analyze')
async def analyze(payload: dict):
    """Simple analysis endpoint. Accepts JSON with keys: 'values' (list) or 'scores' (list)
    Returns a textual summary of detected anomalies using a simple threshold (mean+2*std).
    """
    import numpy as _np
    values = payload.get('values')
    scores = payload.get('scores')
    if scores is None and values is None:
        raise HTTPException(status_code=400, detail='provide values or scores')
    if scores is None:
        try:
            import pandas as pd
            df = pd.DataFrame({'v': values})
            scores = detect_anomalies(df, model)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

    arr = _np.array(scores)
    mean = float(arr.mean())
    std = float(arr.std())
    thresh = mean + 2 * std
    anomaly_idxs = list(_np.where(arr > thresh)[0])
    if not anomaly_idxs:
        text = f"No significant anomalies detected (mean={mean:.4f}, std={std:.4f})."
    else:
        top = anomaly_idxs[:5]
        items = ", ".join(str(int(i)) for i in top)
        text = (
            f"Detected {len(anomaly_idxs)} anomalous timestep(s). "
            f"Prominent indices: {items}. Threshold={thresh:.4f}, mean={mean:.4f}, std={std:.4f}."
        )

    # If an OpenAI key is available, optionally produce a friendly natural-language summary
    OPENAI_KEY = os.environ.get('OPENAI_API_KEY')
    if OPENAI_KEY:
        try:
            import openai
            openai.api_key = OPENAI_KEY
            prompt = (
                f"You are an expert monitoring factory sensor data. "
                f"Given anomaly scores with mean={mean:.4f} and std={std:.4f}, and anomalous indices {anomaly_idxs[:10]}, "
                f"provide a concise summary (2-4 sentences) explaining the likely issue and suggested next steps.")
            resp = openai.ChatCompletion.create(
                model="gpt-3.5-turbo",
                messages=[{"role":"user","content":prompt}],
                max_tokens=200,
            )
            chat_text = resp.choices[0].message.content.strip()
            text = text + "\n\n" + chat_text
        except Exception:
            # fall back to rule-based text if OpenAI fails
            pass

    return {"analysis": text}


@app.websocket('/ws')
async def websocket_endpoint(websocket: WebSocket):
    # allow api_key via query string for websocket
    await websocket.accept()
    buffer = []
    max_len = 200  # max window length for streaming
    try:
        while True:
            msg = await websocket.receive_text()
            # expect CSV content or a single numeric value per message
            try:
                import pandas as pd
                from io import StringIO
                df = pd.read_csv(StringIO(msg))
                scores = detect_anomalies(df, model)
                values = df.select_dtypes(include=["number"]).values.tolist()
                await websocket.send_json({"scores": scores, "values": values})
            except Exception:
                # try single numeric
                try:
                    value = float(msg)
                    buffer.append(value)
                    if len(buffer) > max_len:
                        buffer = buffer[-max_len:]
                    import pandas as pd
                    df = pd.DataFrame({"v": buffer})
                    scores = detect_anomalies(df, model)
                    await websocket.send_json({"scores": scores, "values": buffer})
                except Exception:
                    await websocket.send_json({"error": "could not parse message"})
    except Exception:
        await websocket.close()













































