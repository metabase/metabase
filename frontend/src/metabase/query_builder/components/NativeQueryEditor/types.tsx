import type { Card } from "metabase-types/api";

export type Location = {
  row: number;
  column: number;
};

export type SelectionRange = {
  start: Location;
  end: Location;
};

export type CardCompletionItem = Pick<Card, "id" | "name" | "type"> & {
  collection_name: string;
};

export type AutocompleteItem = [string, string];
