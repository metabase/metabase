import { diffLines } from "diff";

import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  PythonTransformTableAliases,
  TransformSource,
} from "metabase-types/api";

export function getSourceCode(
  transform: { source: TransformSource },
  metadata: Metadata,
): string {
  if (transform.source.type === "python") {
    return transform.source.body;
  }
  if (transform.source.type === "query") {
    const metadataProvider = Lib.metadataProvider(
      transform.source.query.database,
      metadata,
    );
    const query = Lib.fromJsQuery(metadataProvider, transform.source.query);
    if (Lib.queryDisplayInfo(query).isNative) {
      return Lib.rawNativeQuery(query) ?? "";
    }
  }
  return "";
}

export function computeDiffStats(
  oldSource: string,
  newSource: string,
): { additions: number; deletions: number } {
  const changes = diffLines(oldSource, newSource);
  let additions = 0;
  let deletions = 0;

  for (const change of changes) {
    const lineCount = change.count ?? 0;
    if (change.added) {
      additions += lineCount;
    } else if (change.removed) {
      deletions += lineCount;
    }
  }

  return { additions, deletions };
}

export function areSourceTablesEqual(
  a: PythonTransformTableAliases | undefined,
  b: PythonTransformTableAliases | undefined,
) {
  if (a == null || b == null) {
    return a === b;
  }

  const aEntries = Object.entries(a);
  const bEntries = Object.entries(b);

  if (aEntries.length !== bEntries.length) {
    return false;
  }

  return aEntries.every(([key, value], index) => {
    return bEntries[index][0] === key && bEntries[index][1] === value;
  });
}
