import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { FONTS_MOCK_VALUES, getMockResource, setup } from "./setup";

describe("Static Embed Setup phase - EE, with token", () => {
  describe.each([
    {
      resourceType: "dashboard" as const,
    },
    {
      resourceType: "question" as const,
    },
  ])("$resourceType", ({ resourceType }) => {
    describe("Overview tab", () => {
      it("should render content", async () => {
        await setup({
          props: {
            resourceType,
          },
          activeTab: "Overview",
          hasEnterprisePlugins: true,
          tokenFeatures: createMockTokenFeatures({ whitelabel: true }),
        });

        expect(screen.getByText("Setting up a static embed")).toBeVisible();

        const link = screen.getByRole("link", {
          name: "documentation",
        });
        expect(link).toBeVisible();
        expect(link).toHaveAttribute(
          "href",
          "https://www.metabase.com/docs/latest/embedding/static-embedding.html?utm_source=pro-self-hosted&utm_media=static-embed-settings-overview",
        );
      });
    });

    describe("Look and Feel tab", () => {
      it("should render Font selector", async () => {
        await setup({
          props: {
            resourceType,
          },
          activeTab: "Look and Feel",
          hasEnterprisePlugins: true,
          tokenFeatures: createMockTokenFeatures({ whitelabel: true }),
        });

        const fontSelect = screen.getByLabelText("Font");
        expect(fontSelect).toBeVisible();

        await userEvent.click(fontSelect);

        const popover = await screen.findByRole("listbox", { name: "Font" });

        FONTS_MOCK_VALUES.forEach(fontName => {
          expect(within(popover).getByText(fontName)).toBeVisible();
        });

        await userEvent.click(within(popover).getByText(FONTS_MOCK_VALUES[0]));

        expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
          `font=${encodeURIComponent(FONTS_MOCK_VALUES[0])}`,
        );
      });

      it('should not render "Powered by Metabase" banner caption', async () => {
        await setup({
          props: {
            resourceType,
          },
          activeTab: "Look and Feel",
          hasEnterprisePlugins: true,
          tokenFeatures: createMockTokenFeatures({ whitelabel: true }),
        });

        expect(
          screen.queryByText("Removing the banner"),
        ).not.toBeInTheDocument();
      });

      it("should render link to documentation", async () => {
        await setup({
          props: {
            resourceType,
          },
          activeTab: "Look and Feel",
          hasEnterprisePlugins: true,
          tokenFeatures: createMockTokenFeatures({ whitelabel: true }),
        });

        expect(screen.getByText("Customizing look and feel")).toBeVisible();

        const link = screen.getByRole("link", {
          name: "documentation",
        });
        expect(link).toBeVisible();
        expect(link).toHaveAttribute(
          "href",
          "https://www.metabase.com/docs/latest/embedding/static-embedding.html?utm_source=pro-self-hosted&utm_media=static-embed-settings-appearance#customizing-the-appearance-of-static-embeds",
        );
      });

      it('should render "Download buttons" control', async () => {
        await setup({
          props: {
            resourceType,
            resource: getMockResource(resourceType, true),
          },
          activeTab: "Look and Feel",
          hasEnterprisePlugins: true,
          tokenFeatures: createMockTokenFeatures({ whitelabel: true }),
        });

        expect(screen.getByText("Download buttons")).toBeVisible();
        expect(screen.getByLabelText("Download buttons")).toBeChecked();

        await userEvent.click(screen.getByLabelText("Download buttons"));

        expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
          `downloads=false`,
        );
      });
    });
  });
});
