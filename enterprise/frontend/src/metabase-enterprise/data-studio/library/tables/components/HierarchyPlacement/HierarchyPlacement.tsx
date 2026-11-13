import { t } from "ttag";

import { usePrototypeStorage } from "metabase/metadata/prototype-storage";
import { Box, Paper, Select } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { TableId } from "metabase-types/api";

/**
 * Hierarchies as a table tab of their own, with levels nested in a tree or
 * as pills in a list whose rows open a page; or as a sub-tab of Fields.
 * `drawer` is `list` with the Fields tab's field details in a drawer.
 */
export type HierarchyPlacement = "tab" | "list" | "drawer" | "fields";

// PROTOTYPE: a switch to compare the placements
const STORAGE_KEY = "metabase-prototype-hierarchy-placement";

const PLACEMENTS: HierarchyPlacement[] = ["list", "drawer", "tab", "fields"];

const parsePlacement = (value: unknown): HierarchyPlacement =>
  PLACEMENTS.find((placement) => placement === value) ?? "list";

/** Where hierarchies live, kept on reload */
export function useHierarchyPlacement() {
  const [placement, updatePlacement] = usePrototypeStorage(
    STORAGE_KEY,
    parsePlacement,
  );
  const setPlacement = (next: HierarchyPlacement) =>
    updatePlacement(() => next);
  return [placement, setPlacement] as const;
}

export const getHierarchiesUrl = (
  placement: HierarchyPlacement,
  tableId: TableId,
) =>
  placement === "fields"
    ? Urls.dataStudioTableFieldsHierarchies(tableId)
    : Urls.dataStudioTableHierarchies(tableId);

const getPlacementOptions = (): {
  value: HierarchyPlacement;
  label: string;
}[] => [
  { value: "list", label: t`Tab: list + page` },
  { value: "drawer", label: t`Tab: list + page, field drawer` },
  { value: "tab", label: t`Tab: tree` },
  { value: "fields", label: t`In Fields` },
];

/** PROTOTYPE: floats at the page's bottom right to switch placements */
export function HierarchyPlacementToggle({
  placement,
  onChange,
}: {
  placement: HierarchyPlacement;
  onChange: (placement: HierarchyPlacement) => void;
}) {
  return (
    <Box pos="fixed" bottom="1rem" right="1rem" style={{ zIndex: 10 }}>
      <Paper withBorder shadow="md" p="xs">
        <Select
          aria-label={t`Hierarchy prototype variant`}
          data={getPlacementOptions()}
          value={placement}
          allowDeselect={false}
          w={260}
          comboboxProps={{ position: "top-end" }}
          onChange={(value) => {
            const next = PLACEMENTS.find((known) => known === value);
            if (next) {
              onChange(next);
            }
          }}
        />
      </Paper>
    </Box>
  );
}
