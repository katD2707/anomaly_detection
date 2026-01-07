import pandas as pd

def load_csv(path):
    df = pd.read_csv(path)
    # Keep only numeric columns
    df = df.select_dtypes(include=["number"]).copy()
    # Drop rows with NaNs
    df = df.dropna()
    return df
