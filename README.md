# MaintainceAnomalyDetection

Self-hosted web-based AI application to detect anomalies in factory time-series sensor data in real-time.

Quick start

1. Create a virtual environment and install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate   # or `.venv\\Scripts\\Activate.ps1` on Windows PowerShell
pip install -r requirements.txt
```

2. Run the API server:

```bash
uvicorn maintainance_anomaly_detection.main:app --reload --port 8000
```

3. Open the web UI at http://localhost:8000

Project layout

- `src/maintainance_anomaly_detection/` - package source
- `example_data/` - example CSV for UI interaction
- `tests/` - unit tests (run with `pytest`)

Notes
- Uses PyTorch for model implementation. A simple LSTM autoencoder is provided as default; add custom models under `src/maintainance_anomaly_detection/models/`.

Details

- Project root: `MaintainceAnomalyDetection`
- Source package: `src/maintainance_anomaly_detection`
- Example data: `example_data/sample.csv`
- Demo model checkpoint: `models/checkpoint_demo.pth`

Run the server

From the `src` folder run:

```powershell
python -m uvicorn maintainance_anomaly_detection.main:app --reload --port 8000
```

Open `http://localhost:8000` to use the minimal web UI. The UI supports:
- HTTP upload via the "Upload CSV" control (calls `/predict`).
- WebSocket demo via `/ws` (connect from the UI using "Connect WS").

Notebook (training demo)

The notebook `notebooks/training_demo.ipynb` demonstrates two options:
- Option 1 — PyTorch LSTM autoencoder training and inference (uses `train.py`).
- Option 2 — Lightweight `IsolationForest` baseline for quick comparison.

To run the notebook in VS Code:
1. Open the folder in VS Code.
2. Select the Python interpreter from the project's `.venv`.
3. Open `notebooks/training_demo.ipynb` and run cells.

Training from CSV (CLI)

From `src` you can train a simple demo model:

```powershell
python -m maintainance_anomaly_detection.train ..\example_data\sample.csv --out ..\models\checkpoint.pth --epochs 20
```

WebSocket demo

The web UI includes a small WebSocket client at `static/js/ws_client.js`. Use the UI buttons to connect and stream CSV snippets or numeric values to `/ws` for quick testing.

Testing & CI

- Unit tests: `pytest` is configured and example tests live in the `tests/` folder.
- CI: GitHub Actions workflow at `.github/workflows/ci.yml` runs `pytest` on push.

Notes & next steps

- The default model is a minimal LSTM autoencoder for demonstration and extension. Add or replace models under `src/maintainance_anomaly_detection/models/`.
- For production, add batching, model persistence, auth, input validation, and rate limiting.

Authentication & API key

You can protect sensitive endpoints (for example `/analyze`) with a simple API key by setting the `MAINTAINANCE_API_KEY` environment variable. When set, clients must send the key in the `x-api-key` header or as the `api_key` query parameter for WebSocket connections.

OpenAI integration (optional)

If you want richer natural-language summaries from the chatbot, set `OPENAI_API_KEY` in your environment. The server will call the OpenAI ChatCompletion API to generate a friendly explanation when available. Install the optional dependency with `pip install openai` or include it from `requirements.txt`.

UI controls

- **Channel selector**: choose which CSV column to visualize when uploading multi-column datasets.
- **Smoothing**: apply a moving-average window to the value chart for noise reduction.
- **Threshold**: adjust the anomaly score threshold used to highlight suspicious points on the chart.
- **Save/Load Session**: persist the current chart data in `localStorage` for later inspection.

License

This project is released under the MIT License. See `LICENSE` for details.
Training

You can train a simple autoencoder from a CSV (rows=time steps, numeric columns=sensor channels):

```powershell
cd src
python -m maintainance_anomaly_detection.train ..\example_data\sample.csv --out ..\models\checkpoint.pth --epochs 20
```

CI

A GitHub Actions workflow is included at `.github/workflows/ci.yml` that installs dependencies and runs `pytest`.
