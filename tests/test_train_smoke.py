import os
from pathlib import Path
from maintainance_anomaly_detection.train import train_from_csv


def test_train_smoke(tmp_path):
    sample = tmp_path / "sample.csv"
    sample.write_text("v\n0\n1\n2\n3\n4\n")
    out = tmp_path / "model.pth"
    # run a very short train to ensure the function executes and writes a checkpoint
    train_from_csv(str(sample), out_path=str(out), epochs=1)
    assert out.exists()
