import type { Settings } from "metabase-types/api";

interface Options {
  instanceUrl: string;
}

export async function fetchInstanceSettings(
  options: Options,
): Promise<Settings | null> {
  const { instanceUrl } = options;

  const res = await fetch(`${instanceUrl}/api/session/properties`, {
    method: "GET",
    headers: { "content-type": "application/json" },
  });

  if (!res.ok) {
    return null;
  }

  return res.json();
}
