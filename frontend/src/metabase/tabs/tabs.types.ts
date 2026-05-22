import type { EntityState } from "@reduxjs/toolkit";

import type { IconName } from "metabase-types/api";

export interface Tab {
  id: string;
  path: string;
  title: string;
  icon: IconName;
}

export type TabsState = EntityState<Tab, string> & {
  activeId: string | undefined;
};
