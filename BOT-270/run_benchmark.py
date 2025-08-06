import requests
import json
import pandas as pd
from datetime import datetime
import os
import argparse
import asyncio
import aiohttp
from consts import DOC_STRING_CURRENT

SEARCH_REQ_HEADERS = {
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
    'Content-Type': 'application/json',
    'If-Modified-Since': 'Mon, 4 Aug 2025 20:05:06 GMT',
    'Referer': 'http://localhost:3000/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"'
}

TEST_ENVS = [
    {
        'name': 'stats',
        'enabled': True,
        'concurrent': 1,
        'session_id': '85e07e9c-44e9-4d1e-9558-55d46830c8c2',
        'url': 'http://stats.metabase.com/api/search'
    },
    {
        'name': 'fiery-blue',
        'enabled': False,
        'concurrent': 5,
        'session_id': '<SESSION_ID>',
        'url': 'http://fiery-blue.hosted.staging.metabase.com/api/search'
    },
    {
        'name': 'local',
        'enabled': False,
        'concurrent': 5,
        'session_id': '<SESSION_ID>',
        'url': 'http://localhost:3000/api/search'
    }
]

async def async_search_request(session, semaphore, search_text, url, session_id, limit=5):
    params = {
        'q': search_text,
        'search_engine': 'semantic',
        'context': 'command-palette',
        'include_dashboard_questions': 'true',
        'limit': limit
    }
    cookies = { 'metabase.SESSION': session_id }

    async with semaphore:
        try:
            async with session.get(url, params=params, headers=SEARCH_REQ_HEADERS, cookies=cookies) as response:
                if response.status == 200:
                    data = await response.json()
                    return response.status, data['data']
                else:
                    print(f"WARNING: {response.status} response from '{url}' for test '{search_text}'")
                    return response.status, []
        except Exception as e:
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


async def async_run_benchmark(test_queries, url, session_id, k_values=[5, 10], max_concurrent=5, cohort="Nil"):
    print(f"Running async benchmark (cohort='{cohort}', concurrent={max_concurrent}, {url})")

    request_tasks = []
    query_data_list = []

    semaphore = asyncio.Semaphore(max_concurrent)
    async with aiohttp.ClientSession() as session:
        for i, query_data in enumerate(test_queries):
            query_text = query_data["search_text"]
            task = async_search_request(session, semaphore, query_text, url, session_id, limit=max(k_values))
            request_tasks.append(task)
            query_data_list.append((i, query_data))

        # Send all requests
        request_results = await asyncio.gather(*request_tasks)

    # Monitor for failures since we dont have retries
    status_codes = [status for status, _ in request_results]
    success_count = sum(1 for status in status_codes if status == 200)
    total_count = len(status_codes)
    print(f"{success_count}/{total_count} async success for (cohort='{cohort}', {url}")

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


async def run_all_benchmarks_async(test_queries, max_concurrent=5):
    cohorts = set()
    for query_data in test_queries:
        for search_texts_dict in query_data["search_texts"]:
            cohorts.update(search_texts_dict.keys())

    # Run benchmarks for each cohort
    results = {}
    for cohort in sorted(cohorts):
        cohort_tests = []
        for query_data in test_queries:
            for search_texts_dict in query_data["search_texts"]:
                cohort_tests.append({
                    "search_text": search_texts_dict[cohort],
                    "relevant": query_data["relevant"]
                })

        tasks = []
        env_names = []

        for env in TEST_ENVS:
            if env['enabled']:
                task = async_run_benchmark(cohort_tests, env['url'], env['session_id'], max_concurrent=env['concurrent'], cohort=cohort)
                tasks.append(task)
                env_names.append(env['name'])

        task_results = await asyncio.gather(*tasks)

        results[cohort] = {}
        for env_name, result in zip(env_names, task_results):
            results[cohort][env_name] = result
    return results

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Run benchmark evaluation on search endpoints')
    parser.add_argument('--save', action='store_true', help='Save results to CSV file with timestamp')
    parser.add_argument('--verbose', '-v', action='store_true', help='Print DOC_STRING_CURRENT')
    parser.add_argument('--max-concurrent', type=int, default=5, help='Maximum concurrent requests for async mode (default: 5)')
    parser.add_argument('--benchmark', type=str, default='benchmark.json', help='Benchmark json spec (default benchmark.json)')
    args = parser.parse_args()

    test_queries = json.load(open(args.benchmark, 'r'))
    results = asyncio.run(run_all_benchmarks_async(test_queries, max_concurrent=args.max_concurrent))

    df = pd.DataFrame.from_dict({
        (term, model): metrics
        for term, models in results.items()
        for model, metrics in models.items()
    }, orient='index')

    with pd.option_context('display.precision', 3):
        if args.verbose:
            print(DOC_STRING_CURRENT)
        print(df)

    if args.save:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        os.makedirs('results', exist_ok=True)
        filename = f'results/bench_result_{timestamp}.csv'
        df.to_csv(filename, index=True)
        print(f"\nResults saved to: {filename}")
