import type { Comment, UpdateCommentRequest } from "metabase-types/api";

export const updateComment = ({
  id,
  content,
  is_resolved,
}: Partial<UpdateCommentRequest>): Cypress.Chainable<
  Cypress.Response<Comment>
> => {
  return cy.request<Comment>("PUT", `/api/comment/${id}`, {
    content,
    is_resolved,
  });
};
