import fetchMock from "fetch-mock";

import type { Comment, UpdateCommentRequest } from "metabase-types/api";

export const setupCommentEndpoints = (
  comments: Comment[],
  { target_type, target_id }: { target_type: "document"; target_id: number },
) => {
  const url = new URL("api/comment", "http://localhost");
  url.searchParams.append("target_type", target_type);
  url.searchParams.append("target_id", target_id.toString());

  fetchMock.get(`path:${url.pathname}${url.search}`, { comments });
};

/**
 * Mocks `PUT /api/comment/:id`. Updates the matching comment in `comments` in
 * place, so a list endpoint set up with the same array returns the change.
 */
export const setupUpdateCommentEndpoint = (comments: Comment[]) => {
  fetchMock.put("express:/api/comment/:id", ({ expressParams, options }) => {
    const id = Number(expressParams?.id);
    const index = comments.findIndex((comment) => comment.id === id);
    if (index === -1) {
      return 404;
    }
    const changes: UpdateCommentRequest = JSON.parse(String(options.body));
    comments[index] = { ...comments[index], ...changes };
    return comments[index];
  });
};
