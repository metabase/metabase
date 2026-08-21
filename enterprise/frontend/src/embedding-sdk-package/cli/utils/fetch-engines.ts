import type { Engine } from "metabase-types/api";

interface Options {
  instanceUrl: string;
  cookie: string;
}

export async function fetchEngines(
  options: Options,
): Promise<Record<string, Engine> | null> {
  const { instanceUrl, cookie } = options;

  const res = await fetch(`${instanceUrl}/api/database/engines`, {
    method: "GET",
    headers: { "content-type": "application/json", cookie },
  });

  if (!res.ok) {
    return null;
  }

  return res.json();
}
