import { screen, waitFor } from "__support__/ui";

import {
  setup as baseSetup,
  enterpriseRoutes,
  ossRoutes,
  premiumRoutes,
  routeObjtoArray,
  upsellRoutes,
} from "./setup";

const setup = async ({
  isAdmin = true,
  initialRoute = "",
  features = {},
} = {}) => {
  await baseSetup({
    hasTokenFeatures: true,
    isAdmin,
    features,
    initialRoute,
    enterprisePlugins: "*", // means all enterprise plugins
  });
};

const routes = routeObjtoArray({
  ...ossRoutes,
  ...premiumRoutes,
  ...upsellRoutes,
  ...enterpriseRoutes, // includes the license route
  cloud: { path: "skip", testPattern: /nope/ },
}).filter(({ path }) => path !== "skip");

describe("Admin Settings Routing - Enterprise with all features", () => {
  it("renders the settings editor", async () => {
    await setup({ isAdmin: true });
    expect(
      await screen.findByTestId("admin-layout-content"),
    ).toBeInTheDocument();
  });

  describe("renders all the routes", () => {
    it.each(routes)(
      "renders the $name route",
      async ({ path, testPattern, role }) => {
        await setup({ isAdmin: true, initialRoute: path });
        await waitFor(() => {
          expect(
            role
              ? screen.getByRole(role, { name: testPattern })
              : screen.getByText(testPattern),
          ).toBeInTheDocument();
        });
      },
    );
  });

  it("should show an upsell on the cloud route without hosting", async () => {
    await setup({
      initialRoute: "/cloud",
      features: { hosting: false },
    });
    expect(
      await screen.findByText("Migrate to Metabase Cloud"),
    ).toBeInTheDocument();
  });

  it("should show cloud settings on the cloud route without hosting", async () => {
    await setup({
      initialRoute: "/cloud",
      features: { hosting: true },
    });
    expect(await screen.findByText("Cloud settings")).toBeInTheDocument();
  });
});
