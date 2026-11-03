import { useMemo } from "react";

import { useListSegmentsQuery } from "metabase/api";
import type { TableId } from "metabase-types/api";

import type {
  DraftPaletteSegment,
  SavedPaletteSegment,
  SegmentDraft,
  SegmentSource,
} from "./types";

/** The saved segments on a table plus this session's drafts, as palette items. */
export const usePaletteSegments = (
  tableId: TableId | undefined,
  source: SegmentSource,
  drafts: SegmentDraft[],
) => {
  const { data: segments, isLoading } = useListSegmentsQuery();

  const saved = useMemo<SavedPaletteSegment[]>(
    () =>
      (segments ?? [])
        .filter(
          (segment) =>
            !segment.archived &&
            tableId !== undefined &&
            segment.table_id === tableId,
        )
        .map((segment) => ({
          key: `segment-${segment.id}`,
          source,
          status: "saved",
          name: segment.name,
          description: segment.description || undefined,
          segment,
        })),
    [segments, tableId, source],
  );

  const drafted = useMemo<DraftPaletteSegment[]>(
    () =>
      drafts.map((draft) => ({
        key: draft.id,
        source,
        status: "draft",
        name: draft.name,
        query: draft.query,
      })),
    [drafts, source],
  );

  return { saved, drafted, isLoading };
};
