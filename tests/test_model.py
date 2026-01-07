import numpy as np
import pandas as pd
from maintainance_anomaly_detection.model import LSTMAutoencoder
from maintainance_anomaly_detection.inference import detect_anomalies


def test_detect_anomalies_smoke():
    # create simple sine wave with one spike
    t = np.linspace(0, 2 * np.pi, 50)
    vals = np.sin(t)
    vals[25] += 5.0
    df = pd.DataFrame({"v": vals})
    model = LSTMAutoencoder(input_dim=1, hidden_dim=8, latent_dim=4)
    scores = detect_anomalies(df, model)
    assert isinstance(scores, list)
    assert len(scores) == len(df)
    assert all(s >= 0 for s in scores)
