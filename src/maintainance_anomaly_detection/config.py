from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXAMPLE_DATA = ROOT / "example_data"

MODEL_CONFIG = {
    "input_dim": 1,
    "hidden_dim": 32,
    "latent_dim": 8,
    "n_layers": 1,
}
