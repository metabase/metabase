import { waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { createMockComment } from "metabase-types/api/mocks/comment";
import { createMockDocumentContent } from "metabase-types/api/mocks/document";

import { Api } from "./api";
import { cardApi } from "./card";
import { commentApi } from "./comment";

let activeStore: ReturnType<typeof getStore> | undefined;

function setup() {
  fetchMock.get("path:/api/comment", { comments: [createMockComment()] });
  fetchMock.post("path:/api/comment", createMockComment());
  // A query that never settles, standing in for a long-running card query on
  // a document page.
  fetchMock.get("path:/api/card/1", new Promise(() => {}));

  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);
  activeStore = store;

  const listCommentsCalls = () =>
    fetchMock.callHistory.calls("path:/api/comment", { method: "GET" }).length;

  return { store, listCommentsCalls };
}

describe("commentApi invalidation", () => {
  afterEach(() => {
    // Drop the store's RTK Query subscriptions before pulling the fetch routes,
    // otherwise orphaned subscriptions refetch against removed routes.
    activeStore?.dispatch(Api.util.resetApiState());
    activeStore = undefined;
    fetchMock.removeRoutes().clearHistory();
  });

  it("refetches the comment list right after a mutation, even while an unrelated query is still in flight", async () => {
    const { store, listCommentsCalls } = setup();

    store.dispatch(
      commentApi.endpoints.listComments.initiate({
        target_type: "document",
        target_id: 1,
      }),
    );
    await waitFor(() => expect(listCommentsCalls()).toBe(1));

    // Keep a never-settling query in flight. With RTK's default "delayed"
    // invalidation behavior it would block all tag invalidation, so comment
    // mutations on documents with slow cards appeared to do nothing.
    store.dispatch(cardApi.endpoints.getCard.initiate({ id: 1 }));

    await store.dispatch(
      commentApi.endpoints.createComment.initiate({
        target_type: "document",
        target_id: 1,
        child_target_id: "node-1",
        parent_comment_id: null,
        content: createMockDocumentContent(),
      }),
    );

    await waitFor(() => expect(listCommentsCalls()).toBe(2));
  });
});
