import pandas as pd

def transform(orders, customers):
    """Transform function that receives table parameters."""
    print(f"Received orders table with {len(orders)} rows")
    print(f"Received customers table with {len(customers)} rows")
    
    # Merge the tables
    result = pd.merge(orders, customers, on="customer_id", how="inner")
    
    print(f"Merged result has {len(result)} rows")
    
    return result