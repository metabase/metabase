import { screen } from "__support__/ui";

import {
  setup as baseSetup,
  enterpriseRoutes,
  ossRoutes,
  premiumRoutes,
  routeObjtoArray,
  upsellRoutes,
} from "./setup";

const setup = async ({ isAdmin = true, initialRoute = "" } = {}) => {
  return baseSetup({
    hasEnterprisePlugins: true,
    hasTokenFeatures: false,
    isAdmin,
    initialRoute,
  });
};

const routes = routeObjtoArray({
  ...ossRoutes,
  ...enterpriseRoutes, // different license component
});

const notFoundRoutes = routeObjtoArray(premiumRoutes);
const upsells = routeObjtoArray(upsellRoutes);

describe("Admin Settings Routing - Enterprise without features", () => {
  it("renders the settings editor", async () => {
    await setup({ isAdmin: true });
    expect(
      await screen.findByTestId("admin-layout-content"),
    ).toBeInTheDocument();
  });

  describe("renders the common routes", () => {
    it.each(routes)(
      "renders the $name route",
      async ({ path, testPattern }) => {
        await setup({ isAdmin: true, initialRoute: path });
        expect(await screen.findByText(testPattern)).toBeInTheDocument();
      },
    );
  });

  describe("should show an upsell on the $name route", () => {
    it.each(upsells)(
      "should show an upsell on the $name route",
      async ({ path }) => {
        await setup({ isAdmin: true, initialRoute: path });
        expect(
          await screen.findByText("Make Metabase look like you"),
        ).toBeInTheDocument();
      },
    );
  });

  describe("does not render the premium routes", () => {
    it.each(notFoundRoutes)(
      "should not find the $name enterprise route",
      async ({ path }) => {
        await setup({ isAdmin: true, initialRoute: path });
        expect(
          await screen.findByText("We're a little lost..."),
        ).toBeInTheDocument();
      },
    );
  });
});
