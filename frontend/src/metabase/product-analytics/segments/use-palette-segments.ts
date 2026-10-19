import { useMemo } from "react";
import { t } from "ttag";

import { useListSegmentsQuery } from "metabase/api";
import type { TableId } from "metabase-types/api";

import type {
  DraftPaletteSegment,
  SamplePaletteSegment,
  SavedPaletteSegment,
  SegmentDraft,
  SegmentSource,
} from "./types";

/** Stands in for a people table's segments until one is linked. */
export const getSamplePeopleSegments = (): SamplePaletteSegment[] =>
  [
    { key: "sample-paid", name: t`On a paid plan` },
    { key: "sample-trial", name: t`Trialing` },
    { key: "sample-new", name: t`Signed up in the last 30 days` },
    { key: "sample-enterprise", name: t`Enterprise accounts` },
    { key: "sample-dormant", name: t`Inactive for 14+ days` },
  ].map((sample) => ({ ...sample, source: "people", status: "sample" }));

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
