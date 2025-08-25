import pandas as pd

def transform(db):
    """
    Example transform function demonstrating database connectivity.
    
    The db parameter provides:
    - db.read_table(table_name) - reads entire table
    - db.read_table(table_name, schema) - reads table from specific schema
    
    This function would typically:
    1. Read one or more tables using db.read_table()
    2. Perform transformations, joins, aggregations, etc.
    3. Return the final result as a pandas DataFrame
    """
    
    # Example: Read data from multiple tables
    # customers = db.read_table("customers")
    # orders = db.read_table("orders") 
    # products = db.read_table("products", schema="inventory")
    
    # Example: Perform transformations and joins
    # result = customers.merge(orders, on="customer_id")
    # result = result.merge(products, on="product_id")
    
    # For demonstration purposes, return a sample DataFrame
    # In real usage, this would be the result of database operations
    data = {
        'customer_name': ['John Doe', 'Jane Smith', 'Bob Johnson'],
        'total_orders': [5, 12, 3],
        'total_spent': [299.99, 1450.50, 89.95]
    }
    return pd.DataFrame(data)