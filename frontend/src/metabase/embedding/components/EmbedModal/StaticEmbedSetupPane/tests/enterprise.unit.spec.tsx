import userEvent from "@testing-library/user-event";

import { getBrokenUpTextMatcher, screen } from "__support__/ui";

import {
  clearTrackedEvents,
  copyCode,
  expectCodeCopiedEvent,
  expectTrackedEventCount,
  selectServerCodeLanguage,
  setup,
} from "./setup";

describe("Static Embed Setup phase - EE, no token", () => {
  describe.each([
    {
      resourceType: "dashboard" as const,
    },
    {
      resourceType: "question" as const,
    },
  ])("$resourceType", ({ resourceType }) => {
    beforeEach(() => {
      clearTrackedEvents();
    });

    it("should track copying the embed code on every tab", async () => {
      const resourceName =
        resourceType === "dashboard" ? "Dashboard" : "Question";
      await setup({
        props: { resourceType },
        enterprisePlugins: ["whitelabel"],
      });

      await copyCode("frontend");
      expectCodeCopiedEvent({
        artifact: resourceType,
        language: "pug",
        location: "code_overview",
        code: "view",
      });

      await copyCode("backend");
      expectCodeCopiedEvent({
        artifact: resourceType,
        language: "node",
        location: "code_overview",
        code: "backend",
      });

      await userEvent.click(screen.getByRole("tab", { name: "Parameters" }));
      await selectServerCodeLanguage({ newLanguage: "Ruby" });
      await copyCode("backend");
      expectCodeCopiedEvent({
        artifact: resourceType,
        language: "ruby",
        location: "code_params",
        code: "backend",
      });

      await userEvent.click(screen.getByRole("tab", { name: "Look and Feel" }));
      await selectServerCodeLanguage({
        currentLanguage: "Ruby",
        newLanguage: "Python",
      });
      await userEvent.click(screen.getByLabelText("Dark"));
      await userEvent.click(screen.getByLabelText(`${resourceName} title`));
      await userEvent.click(screen.getByLabelText(`${resourceName} border`));
      await copyCode("backend");
      expectCodeCopiedEvent({
        artifact: resourceType,
        language: "python",
        location: "code_appearance",
        code: "backend",
        appearance: { theme: "night", bordered: false, titled: false },
      });

      // Questions have no background option (metabase#43838)
      if (resourceType === "dashboard") {
        await userEvent.click(screen.getByLabelText("Dashboard background"));
        await copyCode("backend");
        expectCodeCopiedEvent({
          artifact: resourceType,
          language: "python",
          location: "code_appearance",
          code: "backend",
          appearance: {
            theme: "night",
            bordered: false,
            titled: false,
            background: false,
          },
        });
      }

      expectTrackedEventCount(resourceType === "dashboard" ? 5 : 4);
    });

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
