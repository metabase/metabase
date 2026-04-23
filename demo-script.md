# Montreal Demo

## Steps

1. (enabled) Clone stats-remote-sync locally
1. Start "Parent" instance locally
1. Init workspace from parent MB
1. Export config.yml from parent MB
1. Substitute remote sync info into config.yml
1. (enabled) Start "Child" instance locally with config.yml
   1. config.yml is loaded to workspace config state
1. (enabled?) Run a transform on the child instance
   1. output goes to temp schema
1. (enabled?) Run a query on the child instance
   1. Input comes from temp schema
1. Tell claude to generate some models/transforms/dashboards
   1. Asset yml files are created
   1. Transform runs go to temp schema
   1. Mission control of Claude activity is visible in the UI of the child instance showing
     - All query runs, transform runs, file changes, remappings, anything else claude is touching
1. Edited asset yml files committed and pushed
1. In parent instance, new assets are visible with results from "production"
   1. Can see UI showing which tx output table remappings exist
   1. Can see transaction run logs showing what the output tables were


## alt:

1. have a metabase instance locally with the github_raw data loaded on it. This is the parent. You'll need an api key to fetch metadata.

Run postgres locally to host both the app db and DWH.

```shell
# Download from https://drive.google.com/file/d/10rhqV-xfwuUB6i2zJx9AAuHXa__2b5ar/view?usp=drive_link
brew services start postgresql
psql postgres
create database montreal_demo_dwh;
\c montreal_demo_dwh
\i ~/Downloads/github_raw.sql
```

Set up a git repository

```shell
mkdir /tmp/metabase_assets
cd /tmp/metabase_assets
touch README.md
git init
```

```shell
cat > ./parent_config.yml <<EOF
version: 1
config:
  users:
    - first_name: Crowberto
      last_name: C
      email: crowberto@metabase.com
      password: blackjet
      is_superuser: true
  databases:
    - name: montreal_demo_dwh
      engine: postgres
      details:
        host: localhost
        port: 5432
        user: $(whoami)
        password:
        dbname: montreal_demo_dwh
        schema-filters-type: inclusion
        schema-filters-patterns: raw_github
  settings:
    remote-sync-url: file:///tmp/metabase_assets
    remote-sync-type: read-write
    remote-sync-branch: main
EOF
```

```shell
MB_CONFIG_FILE_PATH=./parent_config.yml \
MB_DB_CONNECTION_URI="postgres://localhost:5432/metabase?user=metabase&password=password" \
MB_PREMIUM_EMBEDDING_TOKEN=<token> \
clojure -M:dev:ee:ee-dev:drivers:drivers-dev:run
```

1. create a workspace on parent through the UI
1. download config.yaml It should look like this:

```shell
cat > ./child_config.yml <<EOF
version: 1
config:
  api-keys:
    - name: "Claude API key"
      group: admin
      creator: crowberto@metabase.com
      key: mb_adminapikey
  databases:
  - name: montreal_demo_dwh (postgres)
    engine: postgres
    details:
      host: localhost
      port: 5432
      timezone: America/Los_Angeles
      db: montreal_demo_dwh
      user: <user from ws init>
      password: <pw from ws init>
      schema-filters-type: inclusion
      schema-filters-patterns: raw_github
  users:
  - first_name: Workspace
    last_name: Admin
    email: workspace@workspace.local
    password: password1
  workspace:
    name: New workspace
    databases:
      test-data (postgres):
        input_schemas:
        - raw_github
        output_schema: <schema from ws init>
  settings:
    disable-sync: true
    remote-sync-branch: main
    remote-sync-type: read-write
    remote-sync-url: file:///tmp/metabase_assets
EOF
```
1. Download metadata.json. It should look like this:

1. Download field values.json. It should look like this:

1. create an empty github, add a single empty file to it and comit
1. start up local instance with config.yaml, add repo from above `file:///tmp/repo`
1. open up claude code in git repo directory. tell it url of local instance and api key to local instance
1. load the skill
1. create transforms, commit, load, run transforms
1. create dashboards, commit, load, go view
