import {
  Card,
  QueryAction,
  WritebackAction,
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
    id: 1,
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
