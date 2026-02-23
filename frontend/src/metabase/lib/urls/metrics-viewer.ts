const ROOT_URL = "/explore";

export function metricsViewer(hash?: string): string {
  if (hash) {
    return `${ROOT_URL}#${hash}`;
  }
  return ROOT_URL;
}

export function exploreMetric(metricId: number): string {
  return `${ROOT_URL}?metricId=${metricId}`;
}
