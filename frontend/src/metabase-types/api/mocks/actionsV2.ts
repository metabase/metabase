import { getNextId } from "__support__/utils";
import type { ListActionItem, ModelWithActionsItem } from "metabase-types/api";

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

export const createMockModelWithActions = (
  opts: Partial<ModelWithActionsItem> = {},
): ModelWithActionsItem => {
  return {
    collection_id: null,
    collection_name: null,
    collection_position: 1,
    description: null,
    id: getNextId(),
    name: "Model With Actions Mock",
    ...opts,
  };
};
