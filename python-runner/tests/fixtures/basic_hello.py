import pandas as pd

def transform():
    """Basic transform function that returns a simple DataFrame."""
    print("Hello from transform function!")
    
    # Create a simple DataFrame
    df = pd.DataFrame({
        "message": ["Test successful!"],
        "status": ["OK"]
    })
    
    return df