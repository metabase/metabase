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
    describe("Appearance tab", () => {
      it("should render Font selector", async () => {
        setup({
          props: {
            resourceType,
          },
          activeTab: "Appearance",
          hasEnterprisePlugins: true,
          tokenFeatures: createMockTokenFeatures({ whitelabel: true }),
        });

        const fontSelect = screen.getByLabelText("Font");
        expect(fontSelect).toBeVisible();

        userEvent.click(fontSelect);

        const popover = await screen.findByRole("grid");

        FONTS_MOCK_VALUES.forEach(fontName => {
          expect(within(popover).getByText(fontName)).toBeVisible();
        });

        userEvent.click(within(popover).getByText(FONTS_MOCK_VALUES[0]));

        expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
          `font=${encodeURIComponent(FONTS_MOCK_VALUES[0])}`,
        );
      });

      it('should not render "Powered by Metabase" banner caption', async () => {
        setup({
          props: {
            resourceType,
          },
          activeTab: "Appearance",
          hasEnterprisePlugins: true,
          tokenFeatures: createMockTokenFeatures({ whitelabel: true }),
        });

        expect(
          screen.queryByText("Removing the “Powered by Metabase” banner"),
        ).not.toBeInTheDocument();
      });

      if (resourceType === "question") {
        it('should render "Download data" control', () => {
          setup({
            props: {
              resourceType,
              resource: getMockResource(resourceType, true),
            },
            activeTab: "Appearance",
            hasEnterprisePlugins: true,
            tokenFeatures: createMockTokenFeatures({ whitelabel: true }),
          });

          expect(screen.getByText("Download data")).toBeVisible();
          expect(
            screen.getByLabelText(
              "Enable users to download data from this embed",
            ),
          ).toBeChecked();

          userEvent.click(
            screen.getByText("Enable users to download data from this embed"),
          );

          expect(screen.getByTestId("text-editor-mock")).toHaveTextContent(
            `hide_download_button=true`,
          );
        });
      }
    });
  });
});
