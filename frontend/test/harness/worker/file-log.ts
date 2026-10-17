// With NT_FILE_LOG set, a line on stderr for each spec file: the worker, its
// time, its memory, and the garbage collection since the previous line.
import { PerformanceObserver, constants } from "node:perf_hooks";

import { cachedModuleCount } from "./module-cache.ts";

const BYTES_PER_MB = 1024 * 1024;

let filesLogged = 0;
let collectionMs = 0;
let majorCollectionMs = 0;
let collections = 0;
let observer: PerformanceObserver | null = null;

export function startFileLog(): void {
  if (process.env.NT_FILE_LOG) {
    observer = new PerformanceObserver((list) =>
      addCollections(list.getEntries()),
    );
    observer.observe({ entryTypes: ["gc"] });
  }
}

export function logFile(file: string, startedAt: number): void {
  if (!observer) {
    return;
  }
  addCollections(observer.takeRecords());
  filesLogged += 1;
  const fields = [
    `pid=${process.pid}`,
    `idx=${filesLogged}`,
    `ms=${Date.now() - startedAt}`,
    `rss=${Math.round(process.memoryUsage().rss / BYTES_PER_MB)}`,
    `mods=${cachedModuleCount()}`,
    `gc=${Math.round(collectionMs)}`,
    `major=${Math.round(majorCollectionMs)}`,
    `gcs=${collections}`,
    `heap=${Math.round(process.memoryUsage().heapUsed / BYTES_PER_MB)}`,
  ];
  process.stderr.write(`[file] ${fields.join(" ")} ${file}\n`);
  collectionMs = 0;
  majorCollectionMs = 0;
  collections = 0;
}

function addCollections(entries: PerformanceEntry[]): void {
  for (const entry of entries) {
    collectionMs += entry.duration;
    collections += 1;
    if (isMajorCollection(entry)) {
      majorCollectionMs += entry.duration;
    }
  }
}

function isMajorCollection(entry: PerformanceEntry): boolean {
  const detail: unknown = "detail" in entry ? entry.detail : null;
  return (
    typeof detail === "object" &&
    detail !== null &&
    "kind" in detail &&
    detail.kind === constants.NODE_PERFORMANCE_GC_MAJOR
  );
}
