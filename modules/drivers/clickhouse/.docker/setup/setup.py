import copy
import logging
import os
import pprint

import requests

host = os.environ.get('host') if os.environ.get('host') else 'http://localhost'
port = os.environ.get('port') if os.environ.get('port') else '3000'
admin_email = os.environ.get('admin_email') if os.environ.get('admin_email') else 'admin@example.com'
user_email = os.environ.get('user_email') if os.environ.get('user_email') else 'user@example.com'
password = os.environ.get('password') if os.environ.get('password') else 'metabot1'
site_name = 'ClickHouse test'

endpoints = {
    'health_check': '/api/health',
    'properties': '/api/session/properties',
    'setup': '/api/setup',
    'database': '/api/database',
    'login': '/api/session',
    'user': '/api/user',
}
for k, v in endpoints.items():
    endpoints[k] = f"{host}:{port}{v}"

db_base_payload = {
    "is_on_demand": False,
    "is_full_sync": True,
    "is_sample": False,
    "cache_ttl": None,
    "refingerprint": False,
    "auto_run_queries": True,
    "schedules": {},
    "details": {
        "host": "clickhouse",
        "port": 8123,
        "user": "default",
        "password": None,
        "dbname": "default",
        "scan-all-databases": False,
        "ssl": False,
        "tunnel-enabled": False,
        "advanced-options": False
    },
    "name": "Our ClickHouse",
    "engine": "clickhouse"
}


def health():
    response = requests.get(endpoints['health_check'], verify=False)
    if response.json()['status'] == 'ok':
        return 'healthy'
    else:
        health()


def check_response(response, op):
    if response.status_code >= 300:
        print(f'Unexpected status {response.status_code} for {op}', response.text)
        exit(1)


if __name__ == '__main__':
    print("Checking health")

    if health() == 'healthy' and os.environ.get('retry') is None:
        print("Healthy, setting up Metabase")

        session = requests.Session()
        session_token = None
        try:
            token = session.get(endpoints['properties'], verify=False).json()['setup-token']
            setup_payload = {
                'token': f'{token}',
                'user': {
                    'first_name': 'Admin',
                    'last_name': 'Admin',
                    'email': admin_email,
                    'site_name': site_name,
                    'password': password,
                    'password_confirm': password
                },
                'database': None,
                'invite': None,
                'prefs': {
                    'site_name': site_name,
                    'site_locale': 'en',
                    'allow_tracking': False
                }
            }
            print("Getting the setup token")
            session_token = session.post(endpoints['setup'], verify=False, json=setup_payload).json()['id']
        except Exception as e:
            print("The admin user was already created")

        try:
            if session_token is None:
                session_token = session.post(endpoints['login'], verify=False,
                                             json={"username": admin_email, "password": password})

            dbs = session.get(endpoints['database'], verify=False).json()
            print("Current databases:")
            pprint.pprint(dbs['data'])

            sample_db = next((x for x in dbs['data'] if x['id'] == 1), None)
            if sample_db is not None:
                print("Deleting the sample database")
                res = session.delete(f"{endpoints['database']}/{sample_db['id']}")
                check_response(res, 'delete sample db')
            else:
                print("The sample database was already deleted")

            single_node_db = next((x for x in dbs['data']
                                   if x['engine'] == 'clickhouse'
                                   and x['details']['host'] == 'clickhouse'), None)
            if single_node_db is None:
                print("Creating ClickHouse single node db")
                single_node_payload = copy.deepcopy(db_base_payload)
                single_node_payload['name'] = 'ClickHouse (single node)'
                res = session.post(endpoints['database'], verify=False, json=single_node_payload)
                check_response(res, 'create single node db')
            else:
                print("The single node database was already created")

            # cluster_db = next((x for x in dbs['data']
            #                    if x['engine'] == 'clickhouse'
            #                    and x['details']['host'] == 'nginx'), None)
            # if cluster_db is None:
            #     print("Creating ClickHouse cluster db")
            #     cluster_db_payload = copy.deepcopy(db_base_payload)
            #     cluster_db_payload['details']['host'] = 'nginx'
            #     cluster_db_payload['name'] = 'ClickHouse (cluster)'
            #     res = session.post(endpoints['database'], verify=False, json=cluster_db_payload)
            #     check_response(res)
            # else:
            #     print("The cluster database was already created")

            print("Creating a regular user")
            user_payload = {"first_name": "User", "last_name": "User", "email": user_email, "password": password}
            res = session.post(endpoints['user'], verify=False, json=user_payload)
            check_response(res, 'create user')

            print("Done!")
        except Exception as e:
            logging.exception("Failed to setup Metabase", e)
            exit()
