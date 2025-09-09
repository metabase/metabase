import type { Card } from "./card";

export type CheckCardUpdateRequest = {
  card: Card;
};

export type CheckCardUpdateResponse = {
  success: boolean;
  bad_cards: Card[];
};
