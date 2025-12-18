import type { Collection } from "metabase-types/api";

export type SnippetFolderDetails = {
  name: string;
  description?: string | null;
  parent_id?: number | null;
};

export function createSnippetFolder({
  name,
  description = null,
  parent_id = null,
}: SnippetFolderDetails): Cypress.Chainable<Cypress.Response<Collection>> {
  return cy.request("POST", "/api/collection", {
    name,
    description,
    parent_id,
    namespace: "snippets",
  });
}
