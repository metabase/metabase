import requests
import json
import pandas as pd
from datetime import datetime
import os
import argparse
import asyncio
import aiohttp
import time
from consts import DOC_STRING_CURRENT, SEARCH_REQ_HEADERS

from dotenv import load_dotenv
load_dotenv()

SEARCH_ENGINES = ['appdb', 'semantic']

TEST_ENVS = [
    {
        'name': 'stats',
        'enabled': False,
        'concurrent': 5,
        'session_id': '<SESSION_ID>',
        'api_key': os.getenv('STATS_API_KEY'),
        'url': 'http://stats.metabase.com/api/search',
        'engines': ['appdb']
    },
    {
        'name': 'fiery-blue',
        'enabled': True,
        'concurrent': 5,
        'session_id': '<SESSION_ID>',
        'api_key': os.getenv('FIERY_BLUE_API_KEY'),
        'url': 'http://fiery-blue.hosted.staging.metabase.com/api/search',
        'engines': ['appdb', 'semantic']
    },
    {
        'name': 'local',
        'enabled': False,
        'concurrent': 5,
        'session_id': '<SESSION_ID>',
        'api_key': os.getenv('LOCAL_API_KEY'),
        'url': 'http://localhost:3000/api/search',
        'engines': ['appdb', 'semantic']
    }
]

async def async_search_request(session, semaphore, search_text, env, engine, suffix=None, save_dir=None, limit=5):
    params = {
        'q': search_text,
        'search_engine': engine,
        'context': 'command-palette',
        'include_dashboard_questions': 'true',
        'limit': limit
    }
    cookies = { 'metabase.SESSION': env.get('session_id') }
    headers = {**SEARCH_REQ_HEADERS}
    if env.get('api_key'):
        headers['x-api-key'] = env.get('api_key')
        cookies = {}

    url = env['url']
    async with semaphore:
        start_time = time.time()
        try:
            async with session.get(url, params=params, headers=headers, cookies=cookies) as response:
                end_time = time.time()
                duration = end_time - start_time
                
                if response.status == 200:
                    data = await response.json()
                    
                    # Save individual request response if save_dir is provided
                    if save_dir and suffix is not None:
                        request_data_dir = os.path.join(save_dir, 'request_data')
                        os.makedirs(request_data_dir, exist_ok=True)
                        filename = f"{env['name']}_{engine}_{suffix}.json"
                        filepath = os.path.join(request_data_dir, filename.replace('-', '_'))
                        
                        # Add timing information to the saved data
                        data_with_timing = data.copy()
                        data_with_timing['t_duration'] = duration
                        
                        with open(filepath, 'w') as f:
                            json.dump(data_with_timing, f, indent=2)
                    
                    return response.status, data['data']
                else:
                    print(f"WARNING: {response.status} response from '{url}' for test '{search_text}'")
                    return response.status, []
        except Exception as e:
            end_time = time.time()
            duration = end_time - start_time
            print(f"ERROR: in async request to '{url}' for '{search_text}': {e}")
            return 0, []

def is_search_result_relevant(result_obj, relevant_items):
    return any(
        all(result_obj.get(k) == v for k, v in relevant_item.items())
        for relevant_item in relevant_items
    )

def precision_at_k(relevant_items, result_objects, k):
    """Calculate precision at K for a single query"""
    if not result_objects or k <= 0:
        return 0.0

    top_k = result_objects[:k]
    relevant_in_top_k = len([obj for obj in top_k if is_search_result_relevant(obj, relevant_items)])
    return relevant_in_top_k / k

def hit_rate_at_k(relevant_items, result_objects, k):
    """Check if any relevant result appears in top K"""
    if not result_objects or k <= 0:
        return 0.0

    top_k = result_objects[:k]
    return 1.0 if any(is_search_result_relevant(obj, relevant_items) for obj in top_k) else 0.0

def reciprocal_rank(relevant_items, result_objects):
    """Calculate reciprocal rank (1/rank of first relevant result)"""
    if not result_objects:
        return 0.0

    for i, result_obj in enumerate(result_objects):
        if is_search_result_relevant(result_obj, relevant_items):
            return 1.0 / (i + 1)  # rank is 1-indexed
    return 0.0


async def async_run_benchmark(test_queries, env, engine, save_dir=None, k_values=[5, 10], cohort="Nil"):
    max_concurrent = env.get('concurrent', 5)
    print(f"Running async benchmark (cohort='{cohort}', engine='{engine}', concurrent={max_concurrent}, {env['url']})")

    request_tasks = []
    query_data_list = []

    semaphore = asyncio.Semaphore(max_concurrent)
    async with aiohttp.ClientSession() as session:
        for i, query_data in enumerate(test_queries):
            query_text = query_data["search_text"]
            suffix = f"{cohort}_test_{i}"
            task = async_search_request(session, semaphore, query_text, env, engine, suffix=suffix, save_dir=save_dir, limit=max(k_values))
            request_tasks.append(task)
            query_data_list.append((i, query_data))

        # Send all requests
        request_results = await asyncio.gather(*request_tasks)

    # Monitor for failures since we dont have retries
    status_codes = [status for status, _ in request_results]
    success_count = sum(1 for status in status_codes if status == 200)
    total_count = len(status_codes)
    print(f"{success_count}/{total_count} async success for (cohort='{cohort}', engine='{engine}', {env['url']}")

    query_results = []
    for (i, query_data), (_, search_results) in zip(query_data_list, request_results):
        query_text = query_data["search_text"]
        relevant_items = query_data["relevant"]

        result_row = {
            'query_id': i,
            'query_text': query_text,
            'num_relevant': len(relevant_items),
            'num_results': len(search_results),
            'mrr': reciprocal_rank(relevant_items, search_results)
        }

        for k in k_values:
            result_row[f'precision_at_{k}'] = precision_at_k(relevant_items, search_results, k)
            result_row[f'hit_rate_at_{k}'] = hit_rate_at_k(relevant_items, search_results, k)
        query_results.append(result_row)

    results_df = pd.DataFrame(query_results)
    summary_data = {}
    summary_data['mrr'] = results_df['mrr'].mean()
    for k in k_values:
        summary_data[f'precision@{k}'] = results_df[f'precision_at_{k}'].mean()
        summary_data[f'hit@{k}'] = results_df[f'hit_rate_at_{k}'].mean()
    summary_data['# tests'] = len(results_df)
    return summary_data


async def run_all_benchmarks_async(test_data, save_dir=None, n=None):
    results = {}
    if n:
        print(f"Running for {n} tests")
    
    for term_name, term_data in test_data.items():
        # if term_name not in ["term0", "term1"]:
        #     continue

        cohort_tests = []
        for test in term_data["tests"][:n]:
            cohort_tests.append({
                "search_text": test["text"],
                "relevant": test["relevant"]
            })

        tasks = []
        env_engine_pairs = []

        for env in TEST_ENVS:
            if env['enabled']:
                for engine in env['engines']:
                    task = async_run_benchmark(cohort_tests, env, engine, save_dir=save_dir, cohort=term_name)
                    tasks.append(task)
                    env_engine_pairs.append((env['name'], engine))

        task_results = await asyncio.gather(*tasks)

        results[term_name] = {}
        for (env_name, engine), result in zip(env_engine_pairs, task_results):
            if env_name not in results[term_name]:
                results[term_name][env_name] = {}
            results[term_name][env_name][engine] = result
            
    return results

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Run benchmark evaluation on search endpoints')
    parser.add_argument('--save', action='store_true', help='Save results to CSV file with timestamp')
    parser.add_argument('--verbose', '-v', action='store_true', help='Print DOC_STRING_CURRENT')
    parser.add_argument('-n', type=int, default=None, help='How many tests in each batch to run')
    parser.add_argument('--benchmark', type=str, default='benchmark.json', help='Benchmark json spec (default benchmark.json)')
    args = parser.parse_args()

    # Create timestamped run directory if saving
    save_dir = None
    if args.save:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        save_dir = f'data/run_{timestamp}'
        os.makedirs(save_dir, exist_ok=True)
        print(f"Created run directory: {save_dir}")

    test_data = json.load(open(args.benchmark, 'r'))
    results = asyncio.run(run_all_benchmarks_async(test_data, save_dir=save_dir, n=args.n))

    df = pd.DataFrame.from_dict({
        (term, env, engine): metrics
        for term, envs in results.items()
        for env, engines in envs.items()
        for engine, metrics in engines.items()
    }, orient='index')

    with pd.option_context('display.precision', 3):
        if args.verbose:
            print(DOC_STRING_CURRENT)
        print(df)

    if args.save:
        filename = os.path.join(save_dir, 'results.csv')
        df.to_csv(filename, index=True)
        print(f"\nResults saved to: {filename}")
