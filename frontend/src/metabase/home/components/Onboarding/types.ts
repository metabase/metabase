import type { ComponentType, Ref } from "react";

import type { ChecklistItemValue } from "metabase/redux/store";

export type ChecklistItemCTA = "primary" | "secondary";

export interface OnboardingItemProps {
  itemRef: Ref<HTMLDivElement>;
}

export interface ChecklistItemGroup {
  key: string;
  title: string;
  items: {
    key: ChecklistItemValue;
    Component: ComponentType<OnboardingItemProps>;
  }[];
}
