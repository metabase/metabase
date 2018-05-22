
## Working with CrateDB in Metabase

Starting in v0.18.0 Metabase provides a driver for connecting to CrateDB directly and executing queries against any datasets you have. CrateDB uses the PostgreSQL Wire Protocol (since CrateDB v0.57), which makes it easy to use many PostgreSQL compatible tools and libraries directly with CrateDB. Therefore the CrateDB driver for Metabase provides and uses the PostgreSQL driver under the hood to connect to its data source. The below sections provide information on how to get connected to CrateDB.

### Connecting to a CrateDB Dataset

1. Make sure you have CrateDB [installed](https://crate.io/docs/reference/en/latest/installation.html), up and running.

2. Setup a connection by providing a **Name** and a **Host**. CrateDB supports having a connection pool of multiple hosts. This can be achieved by providing a comma-separated list of multiple `<host>:<psql-port>` pairs.

   ```
   host1.example.com:5432,host2.example.com:5432
   ```

3. Click the `Save` button. Done.

Metabase will now begin inspecting your CrateDB Dataset and finding any tables and fields to build up a sense for the schema. Give it a little bit of time to do its work and then you're all set to start querying.

### Known limitations

* Columns/Fields of type `object_array` are deactivated and not exposed. However, their nested fields are listed and also supported for queries.