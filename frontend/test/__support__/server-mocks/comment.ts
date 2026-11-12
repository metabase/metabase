import fetchMock from "fetch-mock";

import type { Comment, MentionableUser } from "metabase-types/api";

export const setupCommentEndpoints = (
  comments: Comment[],
  { target_type, target_id }: { target_type: "document"; target_id: number },
) => {
  const url = new URL("api/comment", "http://localhost");
  url.searchParams.append("target_type", target_type);
  url.searchParams.append("target_id", target_id.toString());

  fetchMock.get(`path:${url.pathname}${url.search}`, { comments });
};

export const setupListMentionsEndpoint = (users: MentionableUser[]) => {
  fetchMock.get("path:/api/comment/mentions", { data: users });
};
