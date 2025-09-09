import type { Card } from "./card";

export type CheckCardDependenciesRequest = Pick<
  Card,
  "id" | "type" | "dataset_query"
>;

export type CheckCardDependenciesResponse = {
  success: boolean;
  bad_cards: Card[];
};
