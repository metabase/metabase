import pandas as pd

def transform():
    # Create mock data that would normally come from Metabase
    print("Transform with simulated table data")
    
    df = pd.DataFrame({
        "id": [1, 2, 3],
        "value": [10, 20, 30]
    })
    
    # Process the data
    df["doubled"] = df["value"] * 2
    
    return df