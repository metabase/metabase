import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { getDataStudioRoutes } from "metabase/data-studio/routes";
import { PLUGIN_REPLACEMENT } from "metabase/plugins";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import { createMockUser } from "metabase-types/api/mocks";

import { getTransformToolsRoutes } from "./routes";

jest.mock("metabase/data-studio/app/pages/DataStudioLayout", () => ({
  DataStudioLayout: jest.requireActual("metabase/router").Outlet,
}));

jest.mock("metabase/data-studio/app/pages/TransformsSectionLayout", () => ({
  TransformsSectionLayout: jest.requireActual("metabase/router").Outlet,
}));

jest.mock("./pages/MigrateModelsPage", () => ({
  MigrateModelsPage: () => <div data-testid="migrate-models-page" />,
}));

const Guard = () => null;

function setup({ isAdmin }: { isAdmin: boolean }) {
  renderWithProviders(
    <Route path="/">
      {getDataStudioRoutes(Guard)}
      <Route path="unauthorized" element={<div data-testid="unauthorized" />} />
    </Route>,
    {
      withRouter: true,
      initialRoute: Urls.transformMigrateModels(),
      storeInitialState: createMockState({
        currentUser: createMockUser({
          is_superuser: isAdmin,
          is_data_analyst: false,
        }),
        settings: mockSettings({ "has-user-setup": true }),
      }),
    },
  );
}

describe("migrate models route", () => {
  const originalGetTransformToolsRoutes =
    PLUGIN_REPLACEMENT.getTransformToolsRoutes;

  beforeEach(() => {
    PLUGIN_REPLACEMENT.getTransformToolsRoutes = getTransformToolsRoutes;
  });

  afterEach(() => {
    PLUGIN_REPLACEMENT.getTransformToolsRoutes =
      originalGetTransformToolsRoutes;
  });

  it("opens the migrate models page for admins", async () => {
    setup({ isAdmin: true });

    expect(
      await screen.findByTestId("migrate-models-page"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("unauthorized")).not.toBeInTheDocument();
  });

  it("redirects users without Data Studio access to the unauthorized page", async () => {
    setup({ isAdmin: false });

    expect(await screen.findByTestId("unauthorized")).toBeInTheDocument();
    expect(screen.queryByTestId("migrate-models-page")).not.toBeInTheDocument();
  });
});
