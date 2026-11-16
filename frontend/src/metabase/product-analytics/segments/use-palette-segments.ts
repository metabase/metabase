import { useMemo } from "react";

import { useListSegmentsQuery } from "metabase/api";
import type { TableId } from "metabase-types/api";

import type {
  DraftPaletteSegment,
  SavedPaletteSegment,
  SegmentDraft,
  SegmentSource,
} from "./types";

/** A draft as a palette item. */
export const toDraftPaletteSegment = (
  draft: SegmentDraft,
  source: SegmentSource,
): DraftPaletteSegment => ({
  key: draft.id,
  source,
  status: "draft",
  name: draft.name,
  query: draft.query,
  isSeed: false,
});

/** The saved segments on a table plus this session's drafts, as palette items. */
export const usePaletteSegments = (
  tableId: TableId | undefined,
  source: SegmentSource,
  drafts: SegmentDraft[],
) => {
  const { data: segments, isLoading, error } = useListSegmentsQuery();

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

  const drafted = useMemo(
    () => drafts.map((draft) => toDraftPaletteSegment(draft, source)),
    [drafts, source],
  );

  return { saved, drafted, isLoading, error };
};
