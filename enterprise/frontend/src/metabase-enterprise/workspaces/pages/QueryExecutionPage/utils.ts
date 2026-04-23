import { t } from "ttag";

export function formatRunningTime(ms: number): string {
  if (ms < 1000) {
    return t`${ms} ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return t`${seconds.toFixed(2)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds - minutes * 60);
  return t`${minutes}m ${remainder}s`;
}

export function formatResultRows(rows: number): string {
  return rows.toLocaleString();
}
