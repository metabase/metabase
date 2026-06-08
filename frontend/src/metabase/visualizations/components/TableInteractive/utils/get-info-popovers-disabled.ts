import type { ClickObject } from "metabase-lib";

type Args = {
  clicked: ClickObject | null | undefined;
  hasMetadataPopovers: boolean;
  isDashboard: boolean;
  isReorderingColumns: boolean;
};

export function getInfoPopoversDisabled({
  clicked,
  hasMetadataPopovers,
  isDashboard,
  isReorderingColumns,
}: Args) {
  return (
    clicked !== null ||
    !hasMetadataPopovers ||
    isDashboard ||
    isReorderingColumns
  );
}
