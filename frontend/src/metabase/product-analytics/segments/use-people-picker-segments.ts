import { useMemo } from "react";

import type { UsersTable } from "../analyses/types";

import type { PaletteSegment } from "./types";
import { usePaletteSegments } from "./use-palette-segments";
import { useSegmentDrafts } from "./use-segment-drafts";

/**
 * The linked people table's saved segments, then this session's drafts of
 * them, for the people group of a column picker. Empty without a people table.
 */
export const usePeoplePickerSegments = (
  usersTable: UsersTable | undefined,
): PaletteSegment[] => {
  const tableId = usersTable?.table.id;
  const { drafts } = useSegmentDrafts(tableId);
  const { saved, drafted } = usePaletteSegments(tableId, "people", drafts);
  return useMemo(
    () => (usersTable !== undefined ? [...saved, ...drafted] : []),
    [usersTable, saved, drafted],
  );
};
