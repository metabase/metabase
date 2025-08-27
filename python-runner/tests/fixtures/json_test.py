import pandas as pd
import json

def transform():
    """Transform function that tests JSON handling."""
    print("Testing JSON processing in transform")
    
    data = {"test": "successful", "count": 42}
    print(json.dumps(data))
    
    return pd.DataFrame([data])