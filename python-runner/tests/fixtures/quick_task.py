import pandas as pd

def transform():
    """Quick transform function for queue testing."""
    print("This should be queued")
    
    return pd.DataFrame({
        "message": ["Quick task executed"]
    })