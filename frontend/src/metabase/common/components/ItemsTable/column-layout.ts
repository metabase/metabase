import type { CollectionContentTableColumn } from "metabase/common/collections/columns";

import type { ResponsiveProps } from "./utils";

export const COLUMN_RESPONSIVE_PROPS = {
  type: {},
  name: {},
  description: { hideAtContainerBreakpoint: "sm" },
  lastEditedBy: { hideAtContainerBreakpoint: "sm" },
  lastEditedAt: { hideAtContainerBreakpoint: "md" },
  actionMenu: {},
  archive: {},
} satisfies Record<CollectionContentTableColumn, ResponsiveProps>;
