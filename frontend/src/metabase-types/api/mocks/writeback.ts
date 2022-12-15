import {
  Card,
  QueryAction,
  WritebackAction,
  WritebackQueryAction,
  QueryActionCard,
} from "metabase-types/api";
import { createMockCard } from "./card";
import { createMockNativeDatasetQuery } from "./query";

export function createMockQueryActionCard({
  action_id = 1,
  dataset_query = createMockNativeDatasetQuery(),
  ...opts
}: Partial<Omit<QueryActionCard, "is_write">> = {}) {
  const card = createMockCard({ dataset_query, ...opts }) as QueryActionCard;

  card.is_write = true;
  card.action_id = action_id;

  return card;
}

export const createMockQueryAction = ({
  card = createMockQueryActionCard(),
  ...opts
}: Partial<WritebackAction & QueryAction> = {}): WritebackAction => {
  return {
    action_id: 1,
    type: "query",
    card_id: card.id,
    card,
    name: "Query Action Mock",
    description: null,
    parameters: [],
    "updated-at": new Date().toISOString(),
    "created-at": new Date().toISOString(),
    ...opts,
  };
};

export const createMockImplictQueryAction = (
  options: Partial<WritebackQueryAction>,
): WritebackQueryAction => ({
  card_id: 1,
  name: "",
  description: "",
  "updated-at": new Date().toISOString(),
  "created-at": new Date().toISOString(),
  slug: "",
  parameters: [
    {
      id: "id",
      target: ["variable", ["template-tag", "id"]],
      type: "type/Integer",
    },
    {
      id: "name",
      target: ["variable", ["template-tag", "name"]],
      type: "type/Text",
    },
  ] as WritebackAction["parameters"],
  type: "implicit",
  visualization_settings: undefined,
  card: createMockQueryActionCard(),
  ...options,
});
