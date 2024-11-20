import type { Card } from "metabase-types/api";

export type SelectionRange = {
  start: number;
  end: number;
};

export type CardCompletionItem = Pick<Card, "id" | "name" | "type"> & {
  collection_name: string;
};

export type AutocompleteItem = [string, string];
