import { useCallback, useMemo, useState } from "react";

import { useInvalidateFindingsMutation } from "metabase-enterprise/api";
import type { ContentDiagnosticsBaseFinding } from "metabase-types/api";

export function useBulkDismissFindings() {
  const [invalidateFindings] = useInvalidateFindingsMutation();
  const [pendingDismissals, setPendingDismissals] = useState<
    Record<string, ContentDiagnosticsBaseFinding["id"][]>
  >({});
  const [dismissedFindingIds, setDismissedFindingIds] = useState(
    () => new Set<ContentDiagnosticsBaseFinding["id"]>(),
  );

  const dismissFindings = useCallback(
    async (findingIds: ContentDiagnosticsBaseFinding["id"][]) => {
      const request = invalidateFindings({ ids: findingIds });
      setPendingDismissals((pending) => ({
        ...pending,
        [request.requestId]: findingIds,
      }));

      try {
        const result = await request.unwrap();
        setDismissedFindingIds(
          (dismissed) => new Set([...dismissed, ...result.invalidated]),
        );
        return result;
      } finally {
        setPendingDismissals((pending) => {
          const next = { ...pending };
          delete next[request.requestId];
          return next;
        });
      }
    },
    [invalidateFindings],
  );

  const hiddenFindingIds = useMemo(
    () =>
      new Set([
        ...Object.values(pendingDismissals).flat(),
        ...dismissedFindingIds,
      ]),
    [pendingDismissals, dismissedFindingIds],
  );

  return {
    dismissFindings,
    hiddenFindingIds,
    isDismissing: Object.keys(pendingDismissals).length > 0,
  };
}

export type BulkDismissAction = Pick<
  ReturnType<typeof useBulkDismissFindings>,
  "dismissFindings" | "isDismissing"
>;
