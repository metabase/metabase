import userEvent from "@testing-library/user-event";

import { screen, within } from "__support__/ui";
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
          enterprisePlugins: ["whitelabel"],
          tokenFeatures: createMockTokenFeatures({ whitelabel: true }),
        });

        expect(screen.getByText("Setting up a static embed")).toBeVisible();

        const link = screen.getByRole("link", {
          name: "documentation",
        });
        expect(link).toBeVisible();
        expect(link).toHaveAttribute(
          "href",
          "https://www.metabase.com/docs/latest/embedding/static-embedding.html?utm_source=product&utm_medium=docs&utm_campaign=embedding-static&utm_content=static-embed-settings-overview&source_plan=pro-self-hosted",
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
          enterprisePlugins: ["whitelabel"],
          tokenFeatures: createMockTokenFeatures({ whitelabel: true }),
        });

        const fontSelect = screen.getByLabelText("Font");
        expect(fontSelect).toBeVisible();
        expect(fontSelect).toHaveValue("Use instance font");

        await userEvent.click(fontSelect);

        const popover = await screen.findByRole("listbox", { name: "Font" });

        FONTS_MOCK_VALUES.forEach((fontName) => {
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
          enterprisePlugins: ["whitelabel"],
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
          enterprisePlugins: ["whitelabel"],
          tokenFeatures: createMockTokenFeatures({ whitelabel: true }),
        });

        expect(screen.getByText("Customizing look and feel")).toBeVisible();

        const link = screen.getByRole("link", {
          name: "documentation",
        });
        expect(link).toBeVisible();
        expect(link).toHaveAttribute(
          "href",
          "https://www.metabase.com/docs/latest/embedding/static-embedding.html?utm_source=product&utm_medium=docs&utm_campaign=embedding-static&utm_content=static-embed-settings-look-and-feel&source_plan=pro-self-hosted#customizing-the-appearance-of-static-embeds",
        );
      });

      it("should render result download toggle", async () => {
        await setup({
          props: {
            resourceType,
            resource: getMockResource(resourceType, true),
          },
          activeTab: "Look and Feel",
          enterprisePlugins: ["whitelabel"],
          tokenFeatures: createMockTokenFeatures({ whitelabel: true }),
        });

        const downloadLabel =
          resourceType === "dashboard"
            ? "Results (csv, xlsx, json, png)"
            : "Download (csv, xlsx, json, png)";

        expect(screen.getByText(downloadLabel)).toBeVisible();
        expect(screen.getByLabelText(downloadLabel)).toBeChecked();

        await userEvent.click(screen.getByLabelText(downloadLabel));

        expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
          resourceType === "dashboard" ? `downloads=pdf` : `downloads=false`,
        );
      });

      if (resourceType === "dashboard") {
        it(`should render the "Export to PDF" toggle`, async () => {
          await setup({
            props: {
              resourceType,
              resource: getMockResource(resourceType, true),
            },
            activeTab: "Look and Feel",
            enterprisePlugins: ["whitelabel"],
            tokenFeatures: createMockTokenFeatures({ whitelabel: true }),
          });

          const downloadLabel = "Export to PDF";
          expect(screen.getByText(downloadLabel)).toBeVisible();
          expect(screen.getByLabelText(downloadLabel)).toBeChecked();

          await userEvent.click(screen.getByLabelText(downloadLabel));

          expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
            `downloads=results`,
          );
        });
      }
    });
  });
});
