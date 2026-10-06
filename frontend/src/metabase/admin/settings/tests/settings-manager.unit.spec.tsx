import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("Admin Settings Routing - settings managers", () => {
  it.each([
    "/license",
    "/updates",
    "/authentication",
    "/authentication/2fa/enrolled",
    "/custom-visualizations",
  ])("redirects settings managers from %s to /unauthorized", async (path) => {
    await setup({
      isAdmin: false,
      initialRoute: path,
      waitForLayout: false,
    });

    expect(await screen.findByTestId("unauthorized-page")).toBeInTheDocument();
  });

  it("redirects the settings index to General for settings managers", async () => {
    await setup({ isAdmin: false, initialRoute: "" });

    expect(await screen.findByText(/site name/i)).toBeInTheDocument();
  });

  it("renders General for settings managers", async () => {
    await setup({ isAdmin: false, initialRoute: "/general" });

    expect(await screen.findByText(/site name/i)).toBeInTheDocument();
  });

  it("renders whitelabel branding for settings managers", async () => {
    await setup({ isAdmin: false, initialRoute: "/whitelabel/branding" });

    expect(screen.getByTestId("admin-layout-content")).toBeInTheDocument();
    expect(screen.queryByTestId("unauthorized-page")).not.toBeInTheDocument();
  });

  it("renders License for admins", async () => {
    await setup({ isAdmin: true, initialRoute: "/license" });

    expect(await screen.findByText(/Looking for more/i)).toBeInTheDocument();
  });
});
