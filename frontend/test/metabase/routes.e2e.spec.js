import React from "react";

import { delay } from "metabase/lib/promise";
import {
  createTestStore,
  useSharedAdminLogin,
  waitForAllRequestsToComplete,
} from "__support__/e2e_tests";

import { mount } from "enzyme";

import reducers from "metabase/reducers-main";
import { getStore } from "metabase/store";
import { getRoutes } from "metabase/routes";

import reactRouterToArray from "react-router-to-array";
const routes = getRoutes(getStore(reducers));

const STATIC_ROUTES = reactRouterToArray(routes).filter(
  path => path !== "/_internal",
);

describe("routes", () => {
  STATIC_ROUTES.map(path => {
    describe(path, () => {
      it("should mount", async () => {
        useSharedAdminLogin();
        const store = await createTestStore();
        store.pushPath(path);
        const app = mount(store.getAppContainer());

        for (let i = 0; i < 5; i++) {
          await delay(100);
          await waitForAllRequestsToComplete();
        }
      });
    });
  });
});
