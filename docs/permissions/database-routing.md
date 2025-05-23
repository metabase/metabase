---
title: Database routing
---

# Database routing

Database routing is designed for organizations that have one database per customer, with each customer database having identical schemas.

With database routing, an admin can build a question once using a router dabatabase, and the question will run its query against a different destination database depending on who is viewing the question.

## How database routing works

You connect Metabase to a database as normal. When you turn on database routing for that database, it becomes a **router database** - the main database that will handle routing queries to **destination databases**. You'll add these destination databases to this router database, with each destination database associated with a value for the user attribute you assign to the router database.

An admin will create questions that query the router database. When other people log in and view these questions, the router database will route the query to a destination database specified by the person's user attribute.

## Setting up database routing

1. [Connect to one of the databases](../databases/connecting.md) you want to use. The database can be any one of the databases, as long as it has the same schema that all the destination databases have. The name used for this router database will be the name all users will see, regardless of which destination database they're routed to.
2. Once connected to this initial database (the "Router database"), go to its Database routing section and toggle on **Enable database routing**.
3. Enter the user attribute you want to use to determine which database a user should be routed to.
4. With the router database set up, you can add destination databases that have the same schema as the router database. In the **Destination databases** section, click **Add**, then fill out the connection details. For each destination database, you'll need to specify a **slug** - this slug is the value that Metabase will use to match against the user attribute you assigned to the router database. At run time, this value will determine which database Metabase will query when a user views a question built on the router database.
5. Add a [user attribute](../people-and-groups/managing.md#adding-a-user-attribute) to people's Metabase accounts. Metabase will use this attribute to determine which database the person should query when viewing a question built on the router database. You can add user attributes manually, or via Single Sign-On (SSO) via [JWT](../people-and-groups/authenticating-with-jwt.md) or [SAML](../people-and-groups/authenticating-with-saml.md).

![Database routing](./images/database-routing.png)

If an admin user lacks a value for the user attribute, they'll see the router database. You can also explicitly set the value for admins to `__METABASE_PRIMARY_DB__`.

If a non-admin user account lacks a valid value for the user attribute, they won't be able to view the question.

## Adding destination databases with the API

To add destination databases programmatically, you'll need an [API key](../people-and-groups/api-keys.md).

Because each database engine has its own settings, we recommend that you use the Network tab in your browser's developer tools while you manually add a destination database in the UI. This way you can see the request Metabase generates.

When you click **Add**, you'll see a `POST` request to `/mirror-database?check_connection_details=true`. Click on that request to get the request's headers and JSON payload.

### Adding a new destination database: example with PostgreSQL via `curl`

Here's a `curl` command to add a PostgreSQL database as a destination database. Here the `slug` is defined by the `name` key (in this case, `Green PostgreSQL`).

```sh
curl 'http://localhost:3000/api/ee/database-routing/mirror-database?check_connection_details=true' \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'X-Api-Key: mb_CpkoZHvSB5R+P+WsuXWRbdT3WbVphFv/rgMX9UGux/4=' \
  --data '{
  "router_database_id": 2,
  "mirrors": [
    {
     "details": {
        "host": "red-postgres",
        "port": 5432,
        "dbname": "sample",
        "user": "metabase",
        "use-auth-provider": false,
        "password": "metasample123",
        "schema-filters-type": "all",
        "ssl": false,
        "tunnel-enabled": false,
        "destination-database": true
      },
      "name": "Green PostgreSQL",
      "engine": "postgres"
    }
  ]
}'
```

The `details` object will have a different set of keys depending on the database.

If you grab the payload from the browser's Network tab, you may see additional, non-required settings:

```sh
curl 'http://localhost:3000/api/ee/database-routing/mirror-database?check_connection_details=true' \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'X-Api-Key: mb_CpkoZHvSB5R+P+WsuXWRbdT3WbVphFv/rgMX9UGux/4=' \
  --data '{
  "router_database_id": 2,
  "mirrors": [
    {
      "is_on_demand": false,
      "is_full_sync": true,
      "is_sample": false,
      "cache_ttl": null,
      "refingerprint": null,
      "auto_run_queries": true,
      "schedules": {
        "metadata_sync": {
          "schedule_minute": 14,
          "schedule_day": null,
          "schedule_frame": null,
          "schedule_hour": null,
          "schedule_type": "hourly"
        },
        "cache_field_values": {
          "schedule_minute": 0,
          "schedule_day": null,
          "schedule_frame": null,
          "schedule_hour": 18,
          "schedule_type": "daily"
        }
      },
      "details": {
        "host": "red-postgres",
        "port": 5432,
        "dbname": "sample",
        "user": "metabase",
        "use-auth-provider": false,
        "password": "metasample123",
        "schema-filters-type": "all",
        "ssl": false,
        "tunnel-enabled": false,
        "destination-database": true
      },
      "name": "Red PostgreSQL",
      "engine": "postgres"
    }
  ]
}'
```
