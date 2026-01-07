import io
import pandas as pd
from fastapi.testclient import TestClient
from maintainance_anomaly_detection.main import app


def test_health():
    client = TestClient(app)
    r = client.get('/health')
    assert r.status_code == 200
    assert r.json().get('status') == 'ok'


def test_predict_example():
    client = TestClient(app)
    csv = "timestamp,value\n0,0\n1,1\n2,2\n"
    files = {'file': ('sample.csv', io.BytesIO(csv.encode('utf-8')), 'text/csv')}
    r = client.post('/predict', files=files)
    assert r.status_code == 200
    data = r.json()
    assert 'scores' in data
    assert isinstance(data['scores'], list)
