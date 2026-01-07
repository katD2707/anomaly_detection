from pathlib import Path
from maintainance_anomaly_detection.data import load_csv


def test_load_csv(tmp_path):
    p = tmp_path / "t.csv"
    p.write_text("a,b\n1,2\n3,4\n")
    df = load_csv(str(p))
    assert list(df.columns) == ["a", "b"]
    assert len(df) == 2
