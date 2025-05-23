import type { CardType } from "./card";
import type { DatabaseId } from "./database";

export type AutocompleteRequest = {
  databaseId: DatabaseId;
  prefix?: string;
  substring?: string;
};

export type AutocompleteSuggestion = [string, string];

export type CardAutocompleteRequest = {
  databaseId: DatabaseId;
  query: string;
};

export type CardAutocompleteSuggestion = {
  id: number;
  name: string;
  type: CardType;
  collection_name: string;
};
