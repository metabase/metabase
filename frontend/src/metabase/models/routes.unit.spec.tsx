import { lazyLoaders } from "__support__/lazy-routes";
import { renderWithProviders, screen } from "__support__/ui";
import { Outlet } from "metabase/router";

import { getRoutes } from "./routes";

jest.mock("metabase/models/containers/ModelActions/ModelActions", () => ({
  __esModule: true,
  default: () => <Outlet />,
}));

function AdminGuard() {
  return <div data-testid="admin-guard" />;
}

describe("model routes", () => {
  it("resolves every page", async () => {
    const loaders = lazyLoaders(getRoutes(() => null));

    expect(loaders).toHaveLength(3);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });

  it("guards the new action page with the admin guard", async () => {
    renderWithProviders(getRoutes(AdminGuard), {
      withRouter: true,
      initialRoute: "/model/1/detail/actions/new",
    });

    expect(await screen.findByTestId("admin-guard")).toBeInTheDocument();
  });
});
