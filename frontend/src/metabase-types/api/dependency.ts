import type { Card } from "./card";

export type AnalyzeCardUpdateRequest = {
  card: Card;
};

export type AnalyzeCardUpdateResponse = {
  success: boolean;
  cards: Card[];
};
