import { screen } from "__support__/ui";

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
  return baseSetup({
    hasEnterprisePlugins: true,
    hasTokenFeatures: true,
    isAdmin,
    features,
    initialRoute,
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
      async ({ path, testPattern }) => {
        await setup({ isAdmin: true, initialRoute: path });
        expect(await screen.findByText(testPattern)).toBeInTheDocument();
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
