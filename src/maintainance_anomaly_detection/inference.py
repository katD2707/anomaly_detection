import torch
import numpy as np
from .model import LSTMAutoencoder

def detect_anomalies(df, model: LSTMAutoencoder, device="cpu"):
    # df: pandas DataFrame of numeric features
    data = df.values.astype(float)
    seq_len, n_features = data.shape
    # convert to tensor shape (seq_len, batch=1, input_dim)
    x = torch.tensor(data, dtype=torch.float32, device=device).unsqueeze(1)
    with torch.no_grad():
        recon = model(x)
    recon_np = recon.squeeze(1).cpu().numpy()
    # compute mse per timestep across features
    errors = np.mean((recon_np - data) ** 2, axis=1)
    return errors.tolist()
