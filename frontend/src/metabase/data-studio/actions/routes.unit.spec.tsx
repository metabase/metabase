import { lazyLoaders } from "__support__/lazy-routes";
import { renderWithProviders, screen } from "__support__/ui";

import { getDataStudioActionRoutes } from "./routes";

function AdminGuard() {
  return <div data-testid="admin-guard" />;
}

describe("data studio action routes", () => {
  it("resolves every page", async () => {
    const loaders = lazyLoaders(getDataStudioActionRoutes(() => null));

    expect(loaders).toHaveLength(9);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });

  it("guards the new action page with the admin guard", async () => {
    renderWithProviders(getDataStudioActionRoutes(AdminGuard), {
      withRouter: true,
      initialRoute: "/actions/new",
    });

    expect(await screen.findByTestId("admin-guard")).toBeInTheDocument();
  });
});
