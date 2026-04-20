import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockCollection,
  createMockDatabase,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  NewNativeTransformPage,
  NewQueryTransformPage,
} from "./NewTransformPage";

const DATABASE = createMockDatabase({
  id: 1,
  transforms_permissions: "write",
});

type SetupOpts = {
  isReadOnlyMode?: boolean;
  component: "query" | "native";
};

function setup({ isReadOnlyMode = false, component }: SetupOpts) {
  setupDatabasesEndpoints([DATABASE]);
  fetchMock.get("path:/api/collection/root", createMockCollection());
  fetchMock.get("path:/api/activity/recents", []);

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings({
      "read-only-mode": isReadOnlyMode,
    }),
  });

  const PageComponent =
    component === "query" ? NewQueryTransformPage : NewNativeTransformPage;

  renderWithProviders(
    <Route
      path="/data-studio/transforms/new/:type"
      component={PageComponent}
    />,
    {
      withRouter: true,
      initialRoute: `/data-studio/transforms/new/${component}`,
      storeInitialState: state,
    },
  );
}

describe("NewTransformPage", () => {
  describe("read-only mode", () => {
    it("should show not found page for new query transform when instance is in read-only mode", async () => {
      setup({ isReadOnlyMode: true, component: "query" });

      expect(
        await screen.findByText("We're a little lost..."),
      ).toBeInTheDocument();
    });

    it("should show not found page for new native transform when instance is in read-only mode", async () => {
      setup({ isReadOnlyMode: true, component: "native" });

      expect(
        await screen.findByText("We're a little lost..."),
      ).toBeInTheDocument();
    });

    it("should not show not found page when instance is not in read-only mode", async () => {
      setup({ isReadOnlyMode: false, component: "query" });

      expect(
        await screen.findByTestId("transform-query-editor"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("We're a little lost..."),
      ).not.toBeInTheDocument();
    });
  });
});
