import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import pandas as pd
from pathlib import Path
from .model import LSTMAutoencoder


def create_dataset_from_df(df: pd.DataFrame):
    arr = df.select_dtypes(include=["number"]).values.astype(np.float32)
    # shape expected: seq_len, features
    return torch.tensor(arr).unsqueeze(1)  # seq_len, batch=1, input_dim


def train_from_csv(path, out_path="models/checkpoint.pth", epochs=10, lr=1e-3, device="cpu"):
    df = pd.read_csv(path)
    x = create_dataset_from_df(df).to(device)
    input_dim = x.shape[2]
    model = LSTMAutoencoder(input_dim=input_dim).to(device)
    criterion = nn.MSELoss()
    optim = torch.optim.Adam(model.parameters(), lr=lr)

    model.train()
    for ep in range(epochs):
        optim.zero_grad()
        recon = model(x)
        loss = criterion(recon, x)
        loss.backward()
        optim.step()
        print(f"Epoch {ep+1}/{epochs} loss={loss.item():.6f}")

    out_dir = Path(out_path).parent
    out_dir.mkdir(parents=True, exist_ok=True)
    model.save(out_path)
    print(f"Model saved to {out_path}")


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument("csv")
    p.add_argument("--out", default="models/checkpoint.pth")
    p.add_argument("--epochs", type=int, default=10)
    args = p.parse_args()
    train_from_csv(args.csv, out_path=args.out, epochs=args.epochs)
