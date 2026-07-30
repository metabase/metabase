import { createRef } from "react";

import type { ChecklistItemGroup } from "metabase/home/components/Onboarding/types";

export const createItemsRefs = (itemsGroups: ChecklistItemGroup[]) =>
  Object.fromEntries(
    itemsGroups.flatMap((group) =>
      group.items.map((item) => [item.key, createRef<HTMLDivElement>()]),
    ),
  );
