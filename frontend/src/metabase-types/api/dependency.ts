import type { Card } from "./card";

export type CheckCardDependenciesRequest = Pick<
  Card,
  "id" | "dataset_query" | "result_metadata"
>;

export type CheckCardDependenciesResponse = {
  success: boolean;
  bad_cards: Card[];
};
