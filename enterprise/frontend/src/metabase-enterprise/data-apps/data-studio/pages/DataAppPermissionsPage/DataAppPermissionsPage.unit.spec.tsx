import {
  setupDataAppEndpoint,
  setupDataAppGroupsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockDataApp } from "metabase-types/api/mocks";

import { DataAppPermissionsPage } from "./DataAppPermissionsPage";

type SetupOpts = {
  allowedHosts: string[];
};

function setup({ allowedHosts }: SetupOpts) {
  const app = createMockDataApp({ slug: "sales", allowed_hosts: allowedHosts });
  setupDataAppEndpoint(app);
  setupDataAppGroupsEndpoint(app.slug, []);

  renderWithProviders(
    <Route
      path="/data-studio/apps/:slug/permissions"
      element={<DataAppPermissionsPage />}
    />,
    {
      withRouter: true,
      initialRoute: `/data-studio/apps/${app.slug}/permissions`,
    },
  );
}

describe("DataAppPermissionsPage", () => {
  it("warns that permissions don't cover data from the app's external hosts", async () => {
    setup({ allowedHosts: ["https://en.wikipedia.org"] });

    const note = await screen.findByRole("alert");
    expect(note).toHaveTextContent(
      "Permissions don't apply to data from those hosts",
    );
    expect(
      within(note).getByRole("link", { name: "Overview page" }),
    ).toHaveAttribute("href", "/data-studio/apps/sales");
  });

  it("has no external hosts note when the app can't connect to any", async () => {
    setup({ allowedHosts: [] });

    expect(
      await screen.findByRole("button", { name: "Add groups" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
