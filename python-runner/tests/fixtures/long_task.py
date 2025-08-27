import time
import pandas as pd

def transform():
    """Long-running transform function for concurrency testing."""
    print("Long running task started")
    time.sleep(3)
    print("Long running task completed")
    
    return pd.DataFrame({
        "result": ["Task completed"],
        "duration": [3]
    })