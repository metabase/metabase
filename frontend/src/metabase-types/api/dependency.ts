import type { Card } from "./card";

export type CheckCardUpdateRequest = Pick<
  Card,
  "id" | "dataset_query" | "result_metadata"
>;

export type CheckCardUpdateResponse = {
  success: boolean;
  bad_cards: Card[];
};
