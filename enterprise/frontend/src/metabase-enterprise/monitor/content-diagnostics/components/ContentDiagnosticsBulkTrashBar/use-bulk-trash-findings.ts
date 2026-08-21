import { useCallback } from "react";

import { useDeleteTransformMutation } from "metabase/api";
import { archiveAndTrack } from "metabase/archive/analytics";
import { useSetArchive } from "metabase/archive/hooks/use-set-archive";
import type {
  ContentDiagnosticsBaseFinding,
  ContentDiagnosticsEntityType,
} from "metabase-types/api";

export type BulkTrashResult = {
  total: number;
  failed: number;
};

// Cards (question/model/metric), dashboards, documents and collections archive
// under a model that matches their entity type. Transforms have no archived
// state, so they are hard-deleted instead.
type ArchivableModel = Exclude<ContentDiagnosticsEntityType, "transform">;

function getArchivableModel(
  finding: ContentDiagnosticsBaseFinding,
): ArchivableModel | null {
  return finding.entity_type === "transform" ? null : finding.entity_type;
}

/**
 * Trash a set of findings' entities: archive the archivable ones and hard-delete
 * transforms, each via separate API call.
 */
export function useBulkTrashFindings() {
  const archive = useSetArchive();
  const [deleteTransform] = useDeleteTransformMutation();

  return useCallback(
    async (
      findings: ContentDiagnosticsBaseFinding[],
    ): Promise<BulkTrashResult> => {
      const trashFinding = (finding: ContentDiagnosticsBaseFinding) => {
        const model = getArchivableModel(finding);
        if (model === null) {
          return deleteTransform(finding.entity_id).unwrap();
        }
        return archiveAndTrack({
          archive: () =>
            archive({ model, id: finding.entity_id }, true, { notify: false }),
          model,
          modelId: finding.entity_id,
          triggeredFrom: "content_diagnostics",
        });
      };

      const results = await Promise.allSettled(findings.map(trashFinding));
      const failed = results.filter(
        (result) => result.status === "rejected",
      ).length;
      return { total: findings.length, failed };
    },
    [archive, deleteTransform],
  );
}
