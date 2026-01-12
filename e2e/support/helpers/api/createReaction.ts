import type { Comment, CommentId } from "metabase-types/api";

export const createReaction = ({
  comment_id,
  emoji,
}: {
  comment_id: CommentId;
  emoji: string;
}): Cypress.Chainable<Cypress.Response<Comment>> => {
  return cy.request<Comment>("POST", `/api/comment/${comment_id}/reaction`, {
    emoji,
  });
};
