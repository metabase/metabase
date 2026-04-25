import type {
  NativeQuerySnippet,
  NativeQuerySnippetId,
} from "metabase-types/api";

export const updateSnippet = (
  id: NativeQuerySnippetId,
  data: Partial<NativeQuerySnippet>,
) => {
  cy.log(`Updating a snippet with id: ${id}`);
  return cy.request("PUT", `/api/native-query-snippet/${id}`, data);
};
