import csv
import json
import json
import requests
from consts import SEARCH_REQ_HEADERS

def csv_to_benchmark_json(csv_file_path):
    """Convert semantic benchmark CSV to JSON format."""
    result = {}
    
    with open(csv_file_path, 'r', encoding='utf-8') as file:
        reader = csv.DictReader(file)
        
        for row in reader:
            entity_type = row['entity_type']
            name = row['name']
            url = row['id']
            
            # Extract ID from URL (last part after the last slash)
            entity_id = int(url.split('/')[-1])
            
            # Process each term column (term_0 through term_6)
            for i in range(7):
                term_col = f'term_{i}'
                if term_col in row and row[term_col]:
                    term_key = f'term{i}'
                    
                    # Initialize term group if it doesn't exist
                    if term_key not in result:
                        result[term_key] = {"tests": []}
                    
                    # Add test entry
                    test_entry = {
                        "text": row[term_col],
                        "relevant": [
                            {
                                "id": entity_id,
                                "model": entity_type,
                                "name": name
                            }
                        ]
                    }
                    
                    result[term_key]["tests"].append(test_entry)    
    return result


def save_benchmark_json(csv_file_path, output_file_path):
    benchmark_data = csv_to_benchmark_json(csv_file_path)
    
    with open(output_file_path, 'w', encoding='utf-8') as file:
        json.dump(benchmark_data, file, indent=4, ensure_ascii=False)
    
    return benchmark_data


def send_test_request():
    env = {
        'name': 'fiery-blue',
        'session_id': '535dfead-6e2f-462a-8bf1-1efc53623bd4',
        'url': 'http://fiery-blue.hosted.staging.metabase.com/api/search'
    }
    params = {
        'q': 'revenue',
        'search_engine': 'appdb',
        'context': 'command-palette',
        'include_dashboard_questions': 'true',
        'limit': 1
    }
    cookies = {
        'metabase.SESSION': env['session_id']
    }

    resp = requests.get(env['url'], params=params, headers=SEARCH_REQ_HEADERS, cookies=cookies)
    return resp.json()

if __name__ == "__main__":
    print(json.dumps(send_test_request()))