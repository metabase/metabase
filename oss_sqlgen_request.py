#!/usr/bin/env python3
"""
Test script for OSS SQL generation endpoint.

Usage:
    python oss_sqlgen_request.py "Show me all orders from the last 7 days"

Prerequisites:
    1. Metabase backend running with MB_LLM_OPENAI_API_KEY set
    2. Environment variables for auth:
       - MB_TEST_EMAIL (default: test@example.com)
       - MB_TEST_PASSWORD (default: test)
       - MB_BASE_URL (default: http://localhost:3000)
"""

import argparse
import os
import sys

import requests


def get_config():
    return {
        "base_url": os.environ.get("MB_BASE_URL", "http://localhost:3000"),
        "email": os.environ.get("MB_TEST_EMAIL", "vader@metabase.com"),
        "password": os.environ.get("MB_TEST_PASSWORD", "123"),
    }


def authenticate(session, config):
    response = session.post(
        f"{config['base_url']}/api/session",
        json={"username": config["email"], "password": config["password"]},
    )
    if response.status_code != 200:
        print(f"Authentication failed: {response.status_code}")
        print(response.text)
        sys.exit(1)
    return response.json()


def generate_sql(session, config, prompt, database_id=None):
    payload = {"prompt": prompt}
    if database_id:
        payload["database_id"] = database_id

    response = session.post(
        f"{config['base_url']}/api/llm/generate-sql",
        json=payload,
    )
    return response


def main():
    parser = argparse.ArgumentParser(description="Test OSS SQL generation endpoint")
    parser.add_argument("prompt", nargs="?", default="Show me all users")
    parser.add_argument("--database-id", "-d", type=int, help="Database ID")
    parser.add_argument("--no-auth", action="store_true", help="Skip authentication")
    args = parser.parse_args()

    config = get_config()
    session = requests.Session()

    if not args.no_auth:
        print(f"Authenticating to {config['base_url']}...")
        auth_result = authenticate(session, config)
        print(f"Authenticated as user_id={auth_result.get('id')}")

    print(f"\nPrompt: {args.prompt}")
    print("-" * 40)

    response = generate_sql(session, config, args.prompt, args.database_id)

    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(f"Generated SQL:\n{result.get('sql', 'No SQL returned')}")
    else:
        print(f"Error: {response.text}")


if __name__ == "__main__":
    main()
