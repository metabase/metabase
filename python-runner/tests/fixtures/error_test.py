import pandas as pd

def transform():
    """Transform function that raises an error."""
    print("About to cause an error")
    raise ValueError("This is a test error")