# Ingestion Steps

## Clone Flexanalytics Repo

```sh
git clone https://github.com/flexanalytics/dbt-business-intelligence
```

## Create dbt config (so it uses the correct SQL dialect plugin for macros):

Save this in `~/.dbt/profiles.yml`:

```yaml
dbt_business_intelligence:
  target: dev
  outputs:
    dev:
      type: postgres
      host: localhost
      port: 5432
      user: nobody
      password: nothing
      dbname: dbt_bi
      schema: public
```

Note that it doesn't actually connect to Postgres so the `user`, `password`, etc. can be nonsense.

## Generate `target/manifest.json`:

If you have `uv` installed:

```sh
uvx --from dbt-core --with dbt-postgres dbt deps
uvx --from dbt-core --with dbt-postgres dbt parse
```

If you don't have `uv` installed but have `dbt` itself installed you should instead be able to do:

```sh
dbt deps
dbt parse
```

I haven't tested this.

`target/manifest.json` should now exist.
