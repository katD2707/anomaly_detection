import torch
import torch.nn as nn

class LSTMAutoencoder(nn.Module):
    def __init__(self, input_dim=1, hidden_dim=32, latent_dim=8, n_layers=1):
        super().__init__()
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.latent_dim = latent_dim
        self.n_layers = n_layers
        # Encoder: input_dim -> hidden_dim
        self.encoder = nn.LSTM(input_dim, hidden_dim, num_layers=n_layers, batch_first=False)
        # Bottleneck projection
        self.enc_fc = nn.Linear(hidden_dim, latent_dim)
        self.dec_fc = nn.Linear(latent_dim, hidden_dim)
        # Decoder: hidden_dim -> input_dim
        self.decoder = nn.LSTM(hidden_dim, hidden_dim, num_layers=n_layers, batch_first=False)
        self.output_fc = nn.Linear(hidden_dim, input_dim)

    def forward(self, x):
        # x: seq_len, batch, input_dim
        enc_out, (h_n, c_n) = self.encoder(x)
        # enc_out: seq_len, batch, hidden_dim
        latent = self.enc_fc(enc_out)
        dec_in = self.dec_fc(latent)
        dec_out, _ = self.decoder(dec_in)
        out = self.output_fc(dec_out)
        return out

    def save(self, path: str):
        torch.save(self.state_dict(), path)

    @classmethod
    def load(cls, path: str, **kwargs):
        model = cls(**kwargs)
        model.load_state_dict(torch.load(path, map_location="cpu"))
        model.eval()
        return model
