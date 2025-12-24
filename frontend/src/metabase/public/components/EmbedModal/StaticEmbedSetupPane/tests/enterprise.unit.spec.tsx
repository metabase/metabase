import { getBrokenUpTextMatcher, screen } from "__support__/ui";

import { setup } from "./setup";

describe("Static Embed Setup phase - EE, no token", () => {
  describe.each([
    {
      resourceType: "dashboard" as const,
    },
    {
      resourceType: "question" as const,
    },
  ])("$resourceType", ({ resourceType }) => {
    describe("Look and Feel tab", () => {
      it("should not render Font selector", async () => {
        await setup({
          props: {
            resourceType,
          },
          activeTab: "Look and Feel",
          enterprisePlugins: ["whitelabel"],
        });

        expect(
          screen.getByText(
            getBrokenUpTextMatcher("You can change the font with a paid plan."),
          ),
        ).toBeVisible();
      });

      it('should render "Powered by Metabase" banner caption', async () => {
        await setup({
          props: {},
          activeTab: "Look and Feel",
          enterprisePlugins: ["whitelabel"],
        });

        expect(screen.getByText("Removing the banner")).toBeVisible();

        expect(
          screen.getByText(
            "The “Powered by Metabase” banner appears on all guest embeds created with your current version. Upgrade to remove it (and customize a lot more)",
          ),
        ).toBeVisible();
      });
    });
  });
});
