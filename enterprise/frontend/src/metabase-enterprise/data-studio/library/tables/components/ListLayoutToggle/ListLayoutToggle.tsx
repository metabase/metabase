import { t } from "ttag";

import type { ListLayout } from "metabase/data-studio/data-model/pages/DataModel/TableSection/ListSection";
import { usePrototypeStorage } from "metabase/metadata/prototype-storage";
import { Box, Paper, SegmentedControl } from "metabase/ui";

// PROTOTYPE: a debug switch, so the tabs version stays around to compare
const STORAGE_KEY = "metabase-prototype-list-layout";

const parseLayout = (value: unknown): ListLayout =>
  value === "tabs" ? "tabs" : "sections";

/** The Segments and Measures tabs' layout, shared by both and kept on reload */
export function useListLayout() {
  const [layout, updateLayout] = usePrototypeStorage(STORAGE_KEY, parseLayout);
  const setLayout = (next: ListLayout) => updateLayout(() => next);
  return [layout, setLayout] as const;
}

/** PROTOTYPE: floats at the page's bottom right to switch layouts */
export function ListLayoutToggle({
  layout,
  onChange,
}: {
  layout: ListLayout;
  onChange: (layout: ListLayout) => void;
}) {
  return (
    <Box pos="fixed" bottom="1rem" right="1rem" style={{ zIndex: 10 }}>
      <Paper withBorder shadow="md" p="xs">
        <SegmentedControl<ListLayout>
          data={[
            { value: "sections", label: t`No tabs` },
            { value: "tabs", label: t`Tabs` },
          ]}
          value={layout}
          onChange={onChange}
        />
      </Paper>
    </Box>
  );
}
