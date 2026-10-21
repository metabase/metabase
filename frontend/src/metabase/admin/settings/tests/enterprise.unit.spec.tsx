import { screen, waitFor } from "__support__/ui";

import {
  setup as baseSetup,
  enterpriseRoutes,
  ossRoutes,
  premiumRoutes,
  routeObjtoArray,
  upsellRoutes,
} from "./setup";

const setup = async ({ isAdmin = true, initialRoute = "" } = {}) => {
  await baseSetup({
    hasTokenFeatures: false,
    isAdmin,
    initialRoute,
    enterprisePlugins: "*", // means all enterprise plugins
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

  it("should show the whitelabel upsell with a docs link and a trial button on the appearance route", async () => {
    await setup({ isAdmin: true, initialRoute: "/appearance" });

    expect(
      await screen.findByRole("heading", {
        name: "Make Metabase look like you",
      }),
    ).toBeInTheDocument();
    const learnMoreHref = screen
      .getByRole("link", { name: "Learn more" })
      .getAttribute("href");
    expect(learnMoreHref).toContain(
      "https://www.metabase.com/docs/latest/configuring-metabase/appearance",
    );
    expect(learnMoreHref).toContain("utm_");
    expect(
      screen.getByRole("button", { name: "Try for free" }),
    ).toBeInTheDocument();
  });

  describe("does not render the premium routes", () => {
    it.each(notFoundRoutes)(
      "should not find the $name enterprise route",
      async ({ path, testPattern }) => {
        await setup({ isAdmin: true, initialRoute: path });
        expect(screen.queryByText(testPattern)).not.toBeInTheDocument();
      },
    );
  });
});
