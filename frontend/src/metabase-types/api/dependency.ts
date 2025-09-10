import type { Card } from "./card";
import type { Transform } from "./transform";

export type CheckDependenciesResponse = {
  success: boolean;
  bad_cards?: Card[];
  bad_transforms?: Transform[];
};

export type CheckCardDependenciesRequest = Pick<
  Card,
  "id" | "type" | "dataset_query" | "result_metadata"
>;

export type CheckTransformDependenciesRequest = Pick<
  Transform,
  "id" | "source"
>;
