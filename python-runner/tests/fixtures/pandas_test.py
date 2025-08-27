import pandas as pd

def transform():
    """Transform function with pandas operations."""
    print("Testing pandas integration")
    
    df = pd.DataFrame({
        "name": ["Alice", "Bob", "Charlie"],
        "age": [25, 30, 35],
        "city": ["NYC", "SF", "LA"]
    })
    
    print(df.to_string())
    print(f"DataFrame has {len(df)} rows")
    
    return df