import type {
  NativeQuerySnippet,
  RegularCollectionId,
} from "metabase-types/api";

export type NativeQuerySnippetDetails = {
  name?: string;
  description?: string | null;
  content: string;
  collection_id?: RegularCollectionId | null;
};

export function createSnippet({
  name = "Test snippet",
  description = null,
  content,
  collection_id = null,
}: NativeQuerySnippetDetails): Cypress.Chainable<
  Cypress.Response<NativeQuerySnippet>
> {
  return cy.request("POST", "/api/native-query-snippet", {
    name,
    description,
    content,
    collection_id,
  });
}
