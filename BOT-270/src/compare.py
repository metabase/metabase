import json
import pandas as pd
import requests
import argparse
import os
from consts import SEARCH_REQ_HEADERS

compact_names = {
    "rrf": "rrf",
    "recency": "r",
    "pinned": "p",
    "bookmarked": "b",
    "official-collection": "c",
    "dashboard": "d",
    "prefix": "pre",
    "mine": "m",
    "exact": "e",
    "view-count": "v",
    "user-recency": "ur",
    "verified": "ver",
    "text": "t",
    "model": "m",
}

def load_json_to_dataframe(json_data: dict, compact=False) -> pd.DataFrame:
    # Process each item in the data list
    dataframes = []
    
    for item in json_data.get('data', []):
        # Extract basic information
        row_data = {
            'id': item.get('id'),
            'model': item.get('model'),
            'name': item.get('name')
        }
        
        # Process scores
        for score_info in item.get('scores', []):
            score_name = score_info.get('name')
            prefix = score_name if not compact else compact_names.get(score_name, score_name)
            if score_name:
                row_data[f'{prefix}_s'] = score_info.get('score')
                row_data[f'{prefix}_w'] = score_info.get('weight')
                row_data[f'{prefix}_c'] = score_info.get('contribution')
        
        # Create DataFrame for this item
        item_df = pd.DataFrame([row_data])
        dataframes.append(item_df)
    
    # Concatenate all DataFrames
    if dataframes:
        final_df = pd.concat(dataframes, ignore_index=True)
        return final_df
    else:
        # Return empty DataFrame with expected columns if no data
        return pd.DataFrame(columns=['id', 'model', 'name'])

def send_simple_request(search_query: str, limit: int, engine = 'appdb'):
    env = {
        'name': 'fiery-blue',
        'session_id': '535dfead-6e2f-462a-8bf1-1efc53623bd4',
        'url': 'http://fiery-blue.hosted.staging.metabase.com/api/search'
    }
    stats = {
        'name': 'stats',
        'session_id': '',
        'url': 'http://stats.metabase.com/api/search'
    }
    headers = {
        **SEARCH_REQ_HEADERS,
        'x-api-key': os.getenv('STATS_API_KEY')
    }
    params = {
        'q': search_query,
        'search_engine': engine,
        'context': 'command-palette',
        'include_dashboard_questions': 'true',
        'limit': limit
    }
    cookies = {
        'metabase.SESSION': env['session_id']
    }

    resp = requests.get(stats['url'], params=params, headers=headers)
    return resp.json()

def search_results_df(search, limit, engine, compact=False):
    data = send_simple_request(search, limit, engine=engine)
    df = load_json_to_dataframe(data, compact=compact)
    df['engine'] = engine
    return df.set_index('engine')

def main():
    parser = argparse.ArgumentParser(description='Compare search results')
    parser.add_argument('--search', type=str, required=True, help='Search query string')
    parser.add_argument('--compact', action='store_true', help='Compact column names')
    parser.add_argument('--limit', type=int, default=10, help='Limit number of results')
    
    args = parser.parse_args()

    appdb = search_results_df(args.search, args.limit, engine='appdb', compact=args.compact)
    semantic = search_results_df(args.search, args.limit, engine='semantic', compact=args.compact)
    res = pd.concat([appdb, semantic])
    with pd.option_context('display.precision', 3):
        print(res)

if __name__ == "__main__":
    main()