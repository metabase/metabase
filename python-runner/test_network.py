import urllib.request
import os

output_file = os.environ.get('OUTPUT_FILE', '/sandbox/output/result.txt')

try:
    response = urllib.request.urlopen('http://google.com', timeout=5)
    result = "ERROR: Network access was allowed!"
except Exception as e:
    result = f"Good: Network blocked - {type(e).__name__}: {str(e)}"

with open(output_file, 'w') as f:
    f.write(result)
    
print(result)