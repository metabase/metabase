interface Options {
  name: string;
  engine: string;
  settings: Record<string, string | number | boolean>;
  instanceUrl: string;
}

export async function addDatabaseConnection(
  options: Options,
): Promise<boolean> {
  const { instanceUrl, name, engine, settings } = options;

  const url = `${instanceUrl}/api/database`;

  if (settings.ssl) {
    settings["ssl-mode"] = "require";
  }

  if (engine === "bigquery-cloud-sdk") {
    settings["dataset-filters-type"] = "all";
  }

  const res = await fetch(url, {
    method: "POST",
    body: JSON.stringify({
      name,
      engine,
      details: settings,
      auto_run_queries: true,
      is_sample: false,
      is_full_sync: true,
      is_on_demand: false,
      refingerprint: false,
      schedules: {},
      cache_ttl: null,
    }),
    headers: { "content-type": "application/json" },
  });

  if (!res.ok) {
    return false;
  }

  return true;
}
