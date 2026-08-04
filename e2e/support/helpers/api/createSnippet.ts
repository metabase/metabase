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
  collection_id,
}: NativeQuerySnippetDetails): Cypress.Chainable<
  Cypress.Response<NativeQuerySnippet>
> {
  return cy.request("POST", "/api/native-query-snippet", {
    name,
    description,
    content,
    // the snippets root is a real collection now, and the API fills it in when no collection is given
    ...(collection_id == null ? {} : { collection_id }),
  });
}
