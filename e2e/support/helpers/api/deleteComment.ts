import type { CommentId } from "metabase-types/api";

export const deleteComment = (
  commentId: CommentId,
): Cypress.Chainable<Cypress.Response<void>> => {
  return cy.request<void>("DELETE", `/api/comment/${commentId}`);
};
