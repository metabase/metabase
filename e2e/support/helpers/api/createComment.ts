import type { Comment, CreateCommentRequest } from "metabase-types/api";

export const createComment = ({
  target_id,
  target_type,
  child_target_id,
  parent_comment_id = null,
  content,
}: Partial<CreateCommentRequest>): Cypress.Chainable<
  Cypress.Response<Comment>
> => {
  return cy.request<Comment>("POST", "/api/ee/comment", {
    target_id,
    target_type,
    child_target_id,
    parent_comment_id,
    content,
  });
};
