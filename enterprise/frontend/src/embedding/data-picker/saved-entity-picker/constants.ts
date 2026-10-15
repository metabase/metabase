import { t } from "ttag";

import type { ListCollectionsTreeRequest } from "metabase-types/api";

// Shared by the saved-entity and Library pickers so both request the same tree.
export const COLLECTION_TREE_REQUEST: ListCollectionsTreeRequest = {
  "exclude-archived": true,
  "include-library": true,
  namespaces: ["", "shared-tenant-collection", "tenant-specific"],
};

export const CARD_INFO = {
  question: {
    get title() {
      return t`Saved Questions`;
    },
    model: "card",
    icon: "table2",
  },
  model: {
    get title() {
      return t`Models`;
    },
    model: "dataset",
    icon: "model",
  },
  metric: {
    get title() {
      return t`Metrics`;
    },
    model: "metric",
    icon: "metric",
  },
  table: {
    get title() {
      return t`Data`;
    },
    model: "table",
    icon: "table",
  },
} as const;
