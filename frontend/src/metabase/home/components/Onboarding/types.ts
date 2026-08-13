import type { ComponentType, Ref } from "react";

import type { ChecklistItemValue } from "metabase/redux/store";

export type ChecklistItemCTA = "primary" | "secondary";

export interface OnboardingItemProps {
  value: ChecklistItemValue;
  /**
   * Optional because `createItemsRefs` only makes a ref for the items that are
   * on the page: an item hidden by permissions or by a setting has none.
   */
  itemRef?: Ref<HTMLDivElement>;
}

export interface ChecklistItemGroup {
  title: string;
  items: {
    value: ChecklistItemValue;
    Component: ComponentType<OnboardingItemProps>;
  }[];
}
