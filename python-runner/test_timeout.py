import time
import os

output_file = os.environ.get('OUTPUT_FILE', '/sandbox/output/result.txt')

print("Starting long-running task...")
time.sleep(15)  # Sleep longer than default timeout

# This should never execute
with open(output_file, 'w') as f:
    f.write("Task completed")
print("Task completed")