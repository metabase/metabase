import userEvent from "@testing-library/user-event";

import { screen, within } from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import {
  FONTS_MOCK_VALUES,
  clearTrackedEvents,
  copyCode,
  expectCodeCopiedEvent,
  expectTrackedEventCount,
  getMockResource,
  selectServerCodeLanguage,
  setup,
} from "./setup";

describe("Static Embed Setup phase - EE, with token", () => {
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

    it("should track copying the embed code with the download options", async () => {
      const resourceName =
        resourceType === "dashboard" ? "Dashboard" : "Question";
      const allDownloads = { pdf: true, results: true };
      await setup({
        props: { resourceType },
        enterprisePlugins: ["whitelabel"],
        tokenFeatures: createMockTokenFeatures({ whitelabel: true }),
      });

      // Separate download options exist for dashboards only
      if (resourceType === "dashboard") {
        await userEvent.click(
          screen.getByRole("tab", { name: "Look and Feel" }),
        );

        await userEvent.click(screen.getByLabelText("Export to PDF"));
        await copyCode("backend");
        expectCodeCopiedEvent({
          artifact: resourceType,
          language: "node",
          location: "code_appearance",
          code: "backend",
          appearance: {
            enabled_download_types: { pdf: false, results: true },
          },
        });

        await userEvent.click(screen.getByLabelText("Export to PDF"));
        await userEvent.click(
          screen.getByLabelText("Results (csv, xlsx, json, png)"),
        );
        await copyCode("backend");
        expectCodeCopiedEvent({
          artifact: resourceType,
          language: "node",
          location: "code_appearance",
          code: "backend",
          appearance: {
            enabled_download_types: { pdf: true, results: false },
          },
        });

        await userEvent.click(
          screen.getByLabelText("Results (csv, xlsx, json, png)"),
        );
        await userEvent.click(screen.getByRole("tab", { name: "Overview" }));
      }

      await copyCode("frontend");
      expectCodeCopiedEvent({
        artifact: resourceType,
        language: "pug",
        location: "code_overview",
        code: "view",
        appearance: { enabled_download_types: allDownloads },
      });

      await copyCode("backend");
      expectCodeCopiedEvent({
        artifact: resourceType,
        language: "node",
        location: "code_overview",
        code: "backend",
        appearance: { enabled_download_types: allDownloads },
      });

      await userEvent.click(screen.getByRole("tab", { name: "Parameters" }));
      await selectServerCodeLanguage({ newLanguage: "Ruby" });
      await copyCode("backend");
      expectCodeCopiedEvent({
        artifact: resourceType,
        language: "ruby",
        location: "code_params",
        code: "backend",
        appearance: { enabled_download_types: allDownloads },
      });

      await userEvent.click(screen.getByRole("tab", { name: "Look and Feel" }));
      await selectServerCodeLanguage({
        currentLanguage: "Ruby",
        newLanguage: "Python",
      });
      await userEvent.click(screen.getByLabelText("Dark"));
      await userEvent.click(screen.getByLabelText(`${resourceName} title`));
      await userEvent.click(screen.getByLabelText(`${resourceName} border`));
      await userEvent.click(screen.getByLabelText("Font"));
      await userEvent.click(
        within(await screen.findByRole("listbox", { name: "Font" })).getByText(
          FONTS_MOCK_VALUES[1],
        ),
      );
      await userEvent.click(
        screen.getByLabelText(
          resourceType === "dashboard"
            ? "Results (csv, xlsx, json, png)"
            : "Download (csv, xlsx, json, png)",
        ),
      );
      // Both options have to be off for a dashboard
      if (resourceType === "dashboard") {
        await userEvent.click(screen.getByLabelText("Export to PDF"));
      }
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
          font: "custom",
          enabled_download_types: { pdf: false, results: false },
        },
      });

      expectTrackedEventCount(resourceType === "dashboard" ? 6 : 4);
    });

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
        expect(
          await screen.findByText("Setting up a static embed"),
        ).toBeVisible();

        const link = screen.getByRole("link", {
          name: "documentation",
        });
        expect(link).toBeVisible();
        expect(link).toHaveAttribute(
          "href",
          "https://www.metabase.com/docs/latest/embedding/guest-embedding.html?utm_source=product&utm_medium=docs&utm_campaign=embedding-static&utm_content=static-embed-settings-overview&source_plan=pro-self-hosted",
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
          "https://www.metabase.com/docs/latest/embedding/guest-embedding.html?utm_source=product&utm_medium=docs&utm_campaign=embedding-static&utm_content=static-embed-settings-look-and-feel&source_plan=pro-self-hosted#customizing-appearance-of-guest-embeds",
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
