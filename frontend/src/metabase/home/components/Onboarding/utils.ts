import { createRef } from "react";

import type { ChecklistItemGroup } from "./types";

export const createItemsRefs = (itemsGroups: ChecklistItemGroup[]) =>
  Object.fromEntries(
    itemsGroups.flatMap((group) =>
      group.items.map((item) => [item.value, createRef<HTMLDivElement>()]),
    ),
  );
