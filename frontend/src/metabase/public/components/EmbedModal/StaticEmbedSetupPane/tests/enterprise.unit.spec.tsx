import { screen } from "@testing-library/react";

import { getBrokenUpTextMatcher } from "__support__/ui";

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
    describe("Appearance tab", () => {
      it("should not render Font selector", async () => {
        await setup({
          props: {
            resourceType,
          },
          activeTab: "Appearance",
          hasEnterprisePlugins: true,
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
          activeTab: "Appearance",
          hasEnterprisePlugins: true,
        });

        expect(
          screen.getByText("Removing the “Powered by Metabase” banner"),
        ).toBeVisible();

        expect(
          screen.getByText(
            getBrokenUpTextMatcher(
              "This banner appears on all static embeds created with the Metabase open source version. You’ll need to upgrade to a paid plan to remove the banner.",
            ),
          ),
        ).toBeVisible();
      });
    });
  });
});
