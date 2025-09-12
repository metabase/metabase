import type { Comment, UpdateCommentRequest } from "metabase-types/api";

export const updateComment = ({
  id,
  content,
  is_resolved,
}: Partial<UpdateCommentRequest>): Cypress.Chainable<
  Cypress.Response<Comment>
> => {
  return cy.request<Comment>("PUT", `/api/ee/comment/${id}`, {
    content,
    is_resolved,
  });
};
