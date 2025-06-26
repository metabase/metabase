import { getNextId } from "__support__/utils";
import type { ListActionItem } from "metabase-types/api";

export const createMockActionListItem = (
  opts: Partial<ListActionItem> = {},
): ListActionItem => {
  return {
    id: 1,
    name: "Table Action Mock",
    description: "",
    ...opts,
  };
};

export const createMockTableActions = (
  opts: Partial<ListActionItem> = {},
): ListActionItem[] => {
  return [
    createMockActionListItem({
      id: getNextId(),
      name: "Create",
      ...opts,
    }),
    createMockActionListItem({
      id: getNextId(),
      name: "Update",
      ...opts,
    }),
    createMockActionListItem({
      id: getNextId(),
      name: "Create or Update",
      ...opts,
    }),
    createMockActionListItem({
      id: getNextId(),
      name: "Delete",
      ...opts,
    }),
  ];
};

export const createMockModelActions = (
  opts: Partial<ListActionItem> = {},
): ListActionItem[] => {
  return [
    createMockActionListItem({
      id: getNextId(),
      name: "Create",
      ...opts,
    }),
    createMockActionListItem({
      id: getNextId(),
      name: "Update",
      ...opts,
    }),
    createMockActionListItem({
      id: getNextId(),
      name: "Delete",
      ...opts,
    }),
  ];
};
