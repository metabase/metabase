import { combineReducers, configureStore } from "@reduxjs/toolkit";
import fetchMock from "fetch-mock";

import { setupUpdatePasswordEndpoint } from "__support__/server-mocks";
import { Api } from "metabase/api";
import { userApi } from "metabase/api/user";
import { createMockUser } from "metabase-types/api/mocks";

import { people } from "./people";
import { peopleListenerMiddleware } from "./people-listener-middleware";

const createTestStore = () => {
  return configureStore({
    reducer: combineReducers({
      admin: combineReducers({ people }),
      [Api.reducerPath]: Api.reducer,
    }),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        immutableCheck: false,
        serializableCheck: false,
      })
        .concat(Api.middleware)
        .concat(peopleListenerMiddleware.middleware as any),
  });
};

describe("people-listener-middleware", () => {
  afterEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  describe("createUser listener", () => {
    it("should store temporary password when createUser includes a password", async () => {
      const createdUser = createMockUser({ id: 42 });
      fetchMock.post("path:/api/user", createdUser);

      const store = createTestStore();
      await store
        .dispatch(
          userApi.endpoints.createUser.initiate({
            first_name: "Test",
            last_name: "User",
            email: "test@example.com",
            password: "secret-password",
            user_group_memberships: [],
          }),
        )
        .unwrap();

      expect(store.getState().admin.people.temporaryPasswords[42]).toBe(
        "secret-password",
      );
    });

    it("should not store anything when createUser has no password", async () => {
      const createdUser = createMockUser({ id: 42 });
      fetchMock.post("path:/api/user", createdUser);

      const store = createTestStore();
      await store
        .dispatch(
          userApi.endpoints.createUser.initiate({
            first_name: "Test",
            last_name: "User",
            email: "test@example.com",
            user_group_memberships: [],
          }),
        )
        .unwrap();

      expect(
        store.getState().admin.people.temporaryPasswords[42],
      ).toBeUndefined();
    });
  });

  describe("updatePassword listener", () => {
    it("should store temporary password after password update", async () => {
      setupUpdatePasswordEndpoint(7);

      const store = createTestStore();
      await store
        .dispatch(
          userApi.endpoints.updatePassword.initiate({
            id: 7,
            password: "new-password",
            old_password: "old-password",
          }),
        )
        .unwrap();

      expect(store.getState().admin.people.temporaryPasswords[7]).toBe(
        "new-password",
      );
    });
  });
});
