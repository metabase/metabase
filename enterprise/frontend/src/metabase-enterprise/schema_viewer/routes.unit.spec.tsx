import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupNullGetUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { getDataStudioRoutes } from "metabase/data-studio/routes";
import { reinitialize } from "metabase/plugins";
import { Outlet, Route } from "metabase/router";
import {
  createMockCollection,
  createMockDatabase,
  createMockErdResponse,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

const SAMPLE_DB_ID = 1;

type SetupOpts = {
  initialRoute: string;
  hasSchemaViewerFeature: boolean;
};

function setup({ initialRoute, hasSchemaViewerFeature }: SetupOpts) {
  setupDatabasesEndpoints([
    createMockDatabase({ id: SAMPLE_DB_ID, name: "Sample Database" }),
  ]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root", name: "Our analytics" })],
  });
  setupNullGetUserKeyValueEndpoints();
  fetchMock.put(
    "express:/api/user-key-value/namespace/:namespace/key/:key",
    200,
  );
  fetchMock.get("path:/api/ee/erd", createMockErdResponse(), { name: "erd" });

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings({
      "has-user-setup": true,
      "token-features": createMockTokenFeatures({
        "schema-viewer": hasSchemaViewerFeature,
      }),
    }),
  });
  setupEnterpriseOnlyPlugin("schema_viewer");

  const { router } = renderWithProviders(
    <Route path="/">{getDataStudioRoutes(Outlet)}</Route>,
    { withRouter: true, initialRoute, storeInitialState: state },
  );

  return { getLocation: () => router?.location };
}

describe("schema viewer routes", () => {
  afterEach(() => {
    reinitialize();
  });

  it("shows the upsell without the schema-viewer feature and never requests the ERD", async () => {
    setup({
      initialRoute: `/data-studio/schema-viewer?database-id=${SAMPLE_DB_ID}&schema=PUBLIC`,
      hasSchemaViewerFeature: false,
    });

    expect(
      await screen.findByRole("heading", {
        name: "Visualize your database structure",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("schema-picker-button"),
    ).not.toBeInTheDocument();
    expect(fetchMock.callHistory.calls("erd")).toHaveLength(0);
  });

  it("serves the schema viewer under Data Studio and opens it bare from the sidebar", async () => {
    const { getLocation } = setup({
      initialRoute: `/data-studio/schema-viewer?database-id=${SAMPLE_DB_ID}&schema=PUBLIC`,
      hasSchemaViewerFeature: true,
    });

    await waitFor(() => {
      expect(fetchMock.callHistory.calls("erd")).toHaveLength(1);
    });
    expect(
      screen.queryByRole("heading", {
        name: "Visualize your database structure",
      }),
    ).not.toBeInTheDocument();
    expect(await screen.findByTestId("schema-picker-button")).toHaveTextContent(
      "PUBLIC",
    );

    await userEvent.click(screen.getByRole("link", { name: /Schema viewer/ }));

    await waitFor(() => {
      expect(getLocation()?.search).toBe("");
    });
    expect(getLocation()?.pathname).toBe("/data-studio/schema-viewer");
    expect(
      within(screen.getByTestId("schema-picker-button")).getByText(
        "Pick a schema to view",
      ),
    ).toBeInTheDocument();
  });
});
