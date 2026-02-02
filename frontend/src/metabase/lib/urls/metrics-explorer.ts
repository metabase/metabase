const ROOT_URL = "/metrics-explorer";

export function metricsExplorer(hash?: string): string {
  if (hash) {
    return `${ROOT_URL}#${hash}`;
  }
  return ROOT_URL;
}
