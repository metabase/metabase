import { useCallback } from "react";
import { match } from "ts-pattern";

import { useDeleteTransformMutation } from "metabase/api";
import { archiveAndTrack } from "metabase/archive/analytics";
import { useSetArchive } from "metabase/archive/hooks/use-set-archive";
import { deleteTransformAndTrack } from "metabase/transforms/analytics";
import type { ContentDiagnosticsBaseFinding } from "metabase-types/api";

import { trackContentDiagnosticsFindingsBulkTrashed } from "../../analytics";
import type { ContentDiagnosticsTab } from "../types";

export type BulkTrashResult = {
  total: number;
  failedFindings: ContentDiagnosticsBaseFinding[];
};

// Cards (question/model/metric), dashboards, documents and collections archive
// under a model that matches their entity type. Transforms have no archived
// state, so they are hard-deleted instead.
type DiagnosticsArchiveModel =
  | "card"
  | "dataset"
  | "metric"
  | "dashboard"
  | "collection"
  | "document";

function getArchivableModel(
  finding: ContentDiagnosticsBaseFinding,
): DiagnosticsArchiveModel | null {
  if (finding.entity_type === "transform") {
    return null;
  }
  if (finding.entity_type === "card") {
    return match(finding.card_type)
      .returnType<DiagnosticsArchiveModel>()
      .with("model", () => "dataset")
      .with("metric", () => "metric")
      .otherwise(() => "card");
  }
  return finding.entity_type;
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
      tab: ContentDiagnosticsTab,
    ): Promise<BulkTrashResult> => {
      if (findings.length === 0) {
        return { total: 0, failedFindings: [] };
      }
      const startTime = performance.now();
      const trashFinding = (finding: ContentDiagnosticsBaseFinding) => {
        const model = getArchivableModel(finding);
        if (model === null) {
          return deleteTransformAndTrack({
            deleteTransform: () => deleteTransform(finding.entity_id).unwrap(),
            transformId: finding.entity_id,
            triggeredFrom: "content_diagnostics",
          });
        }
        return archiveAndTrack({
          archive: () =>
            archive({ model, id: finding.entity_id }, true, { notify: false }),
          model: model === "dataset" ? "model" : model,
          modelId: finding.entity_id,
          triggeredFrom: "content_diagnostics",
        });
      };

      const outcomes = await Promise.all(
        findings.map(async (finding) => {
          try {
            await trashFinding(finding);
            return null;
          } catch {
            return finding;
          }
        }),
      );
      const failedFindings = outcomes.filter(
        (finding): finding is ContentDiagnosticsBaseFinding => finding != null,
      );
      const removedCount = findings.length - failedFindings.length;
      trackContentDiagnosticsFindingsBulkTrashed({
        tab,
        removedCount,
        selectedCount: findings.length,
        durationMs: Math.trunc(performance.now() - startTime),
        result: match({ removedCount, failedCount: failedFindings.length })
          .with({ removedCount: 0 }, () => "failure" as const)
          .with({ failedCount: 0 }, () => "success" as const)
          .otherwise(() => "partial" as const),
      });
      return { total: findings.length, failedFindings };
    },
    [archive, deleteTransform],
  );
}
