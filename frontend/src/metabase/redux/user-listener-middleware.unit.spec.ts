import { combineReducers, configureStore } from "@reduxjs/toolkit";
import fetchMock from "fetch-mock";

import { setupUserEndpoints } from "__support__/server-mocks";
import { Api } from "metabase/api";
import { userApi } from "metabase/api/user";
import { createMockUser } from "metabase-types/api/mocks";

import { currentUser } from "./user";
import { userListenerMiddleware } from "./user-listener-middleware";

const createTestStore = (initialUser: ReturnType<typeof createMockUser>) => {
  return configureStore({
    reducer: combineReducers({
      currentUser,
      [Api.reducerPath]: Api.reducer,
    }),
    preloadedState: {
      currentUser: initialUser,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        immutableCheck: false,
        serializableCheck: false,
      })
        .concat(Api.middleware)
        .concat(userListenerMiddleware.middleware as any),
  });
};

describe("user-listener-middleware", () => {
  afterEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("should merge the updated user into current user when self-editing", async () => {
    const currentUserState = createMockUser({
      id: 1,
      first_name: "Old",
      last_name: "Name",
    });
    const updatedUser = createMockUser({
      id: 1,
      first_name: "New",
      last_name: "Name",
    });
    setupUserEndpoints(updatedUser);

    const store = createTestStore(currentUserState);
    await store
      .dispatch(
        userApi.endpoints.updateUser.initiate({
          id: 1,
          first_name: "New",
        }),
      )
      .unwrap();

    expect(store.getState().currentUser?.first_name).toBe("New");
  });

  it("should not change current user when updating a different user", async () => {
    const currentUserState = createMockUser({ id: 1, first_name: "Me" });
    const otherUser = createMockUser({ id: 2, first_name: "Other" });
    setupUserEndpoints(otherUser);

    const store = createTestStore(currentUserState);
    await store
      .dispatch(
        userApi.endpoints.updateUser.initiate({
          id: 2,
          first_name: "Other",
        }),
      )
      .unwrap();

    expect(store.getState().currentUser?.first_name).toBe("Me");
    expect(store.getState().currentUser?.id).toBe(1);
  });
});
