interface Options {
  name: string;
  engine: string;
  connection: Record<string, string | boolean | number>;

  cookie: string;
  instanceUrl: string;
}

export async function addDatabaseConnection(options: Options) {
  const { instanceUrl, name, engine, connection, cookie } = options;

  const url = `${instanceUrl}/api/database`;
  const { host } = connection;

  if (connection.ssl) {
    connection["ssl-mode"] = "require";
  }

  if (engine === "bigquery-cloud-sdk") {
    connection["dataset-filters-type"] = "all";
  }

  // If the host points to localhost, we use docker's
  // internal DNS to connect to the host database.
  if (!host || host === "localhost" || host === "127.0.0.1") {
    connection["host"] = "host.docker.internal";
  }

  let res = await fetch(url, {
    method: "POST",
    body: JSON.stringify({
      name,
      engine,
      details: connection,
      auto_run_queries: true,
      is_sample: false,
      is_full_sync: true,
      is_on_demand: false,
      refingerprint: false,
      schedules: {},
      cache_ttl: null,
    }),
    headers: { "content-type": "application/json", cookie },
  });

  if (!res.ok) {
    let errorText = await res.text();

    try {
      errorText = JSON.parse(errorText).message;
    } catch (err) {}

    throw new Error(errorText);
  }

  const successState = await res.json();
  console.log(JSON.stringify(successState, null, 2));

  // TODO: update the database ID to be the one returned by the API
  const databaseId = 2;

  // Synchronize the database schema
  res = await fetch(`${instanceUrl}/api/database/${databaseId}/sync_schema`, {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "content-type": "application/json", cookie },
  });
}
