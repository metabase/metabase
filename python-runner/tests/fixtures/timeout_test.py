import time
import pandas as pd

def transform():
    """Transform function that times out."""
    print("Starting long operation...")
    time.sleep(5)
    print("This should not appear")
    return pd.DataFrame()