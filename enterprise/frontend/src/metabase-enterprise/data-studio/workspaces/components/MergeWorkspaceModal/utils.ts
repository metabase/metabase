import { diffLines } from "diff";

import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { TransformSource } from "metabase-types/api";

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
      return Lib.rawNativeQuery(query);
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
