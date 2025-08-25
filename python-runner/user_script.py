import os
import pandas as pd

# Get output file from environment
output_file = os.environ.get('OUTPUT_FILE', '/sandbox/output/result.csv')

# Example ETL operation
data = {
    'id': [1, 2, 3, 4, 5],
    'value': [10, 20, 30, 40, 50],
    'category': ['A', 'B', 'A', 'C', 'B']
}

df = pd.DataFrame(data)

# Transform data
result = df.groupby('category')['value'].sum().reset_index()
result.columns = ['category', 'total_value']

# Write to output file
result.to_csv(output_file, index=False)
print(f"Results written to {output_file}")