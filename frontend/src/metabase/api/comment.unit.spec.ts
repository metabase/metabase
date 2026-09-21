import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { setupCommentEndpoints } from "__support__/server-mocks";
import type { Comment } from "metabase-types/api";
import { createMockComment } from "metabase-types/api/mocks/comment";
import { createMockDocumentContent } from "metabase-types/api/mocks/document";

import { Api } from "./api";
import { cardApi } from "./card";
import { commentApi } from "./comment";

const LIST_REQUEST = { target_type: "document" as const, target_id: 1 };
const CURRENT_USER = { id: 7, common_name: "Current User" };

let activeStore: ReturnType<typeof getStore> | undefined;

async function setup({ comments }: { comments: Comment[] }) {
  setupCommentEndpoints(comments, LIST_REQUEST);

  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);
  activeStore = store;

  const getCachedComments = () =>
    commentApi.endpoints.listComments.select(LIST_REQUEST)(store.getState())
      .data?.comments;

  store.dispatch(commentApi.endpoints.listComments.initiate(LIST_REQUEST));
  await waitFor(() =>
    expect(getCachedComments()).toHaveLength(comments.length),
  );

  return { store, getCachedComments };
}

describe("commentApi cache updates", () => {
  afterEach(() => {
    // Abort in-flight queries before removing the fetch routes.
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
    fetchMock.removeRoutes().clearHistory();
  });

  it("shows a created comment even while invalidation is starved by an in-flight query", async () => {
    const { store, getCachedComments } = await setup({
      comments: [createMockComment({ id: 1, ...LIST_REQUEST })],
    });
    const newComment = createMockComment({ id: 2, ...LIST_REQUEST });
    fetchMock.post("path:/api/comment", newComment);

    // simulate never-resolving query
    fetchMock.get("path:/api/card/1", new Promise(() => {}));
    store.dispatch(cardApi.endpoints.getCard.initiate({ id: 1 }));

    await store.dispatch(
      commentApi.endpoints.createComment.initiate({
        ...LIST_REQUEST,
        child_target_id: "node-1",
        parent_comment_id: null,
        content: createMockDocumentContent(),
      }),
    );

    expect(getCachedComments()?.map(({ id }) => id)).toEqual([1, 2]);
    expect(
      fetchMock.callHistory.calls("path:/api/comment", { method: "GET" }),
    ).toHaveLength(1);
  });

  it("patches the cached comment when it is updated", async () => {
    const comment = createMockComment({ id: 1, ...LIST_REQUEST });
    const { store, getCachedComments } = await setup({ comments: [comment] });
    fetchMock.put("path:/api/comment/1", { ...comment, is_resolved: true });

    await store.dispatch(
      commentApi.endpoints.updateComment.initiate({ id: 1, is_resolved: true }),
    );

    expect(getCachedComments()?.[0]?.is_resolved).toBe(true);
  });

  it("marks the cached comment as deleted when it is deleted", async () => {
    const { store, getCachedComments } = await setup({
      comments: [createMockComment({ id: 1, ...LIST_REQUEST })],
    });
    fetchMock.delete("path:/api/comment/1", 204);

    await store.dispatch(
      commentApi.endpoints.deleteComment.initiate({ id: 1, ...LIST_REQUEST }),
    );

    expect(getCachedComments()?.[0]?.deleted_at).toEqual(expect.any(String));
  });

  it("toggles the current user's reaction on the cached comment", async () => {
    const { store, getCachedComments } = await setup({
      comments: [createMockComment({ id: 1, ...LIST_REQUEST, reactions: [] })],
    });
    fetchMock.post("path:/api/comment/1/reaction", { reacted: true });

    const toggle = () =>
      store.dispatch(
        commentApi.endpoints.toggleReaction.initiate({
          id: 1,
          emoji: "🤣",
          ...LIST_REQUEST,
          currentUser: CURRENT_USER,
        }),
      );

    await toggle();
    expect(getCachedComments()?.[0]?.reactions).toEqual([
      {
        emoji: "🤣",
        count: 1,
        users: [{ id: CURRENT_USER.id, name: CURRENT_USER.common_name }],
      },
    ]);

    await toggle();
    expect(getCachedComments()?.[0]?.reactions).toEqual([]);
  });

  it("reverts the reaction patch when the request fails", async () => {
    const { store, getCachedComments } = await setup({
      comments: [createMockComment({ id: 1, ...LIST_REQUEST, reactions: [] })],
    });
    fetchMock.post("path:/api/comment/1/reaction", 500);

    await store.dispatch(
      commentApi.endpoints.toggleReaction.initiate({
        id: 1,
        emoji: "🤣",
        ...LIST_REQUEST,
        currentUser: CURRENT_USER,
      }),
    );

    expect(getCachedComments()?.[0]?.reactions).toEqual([]);
  });
});
