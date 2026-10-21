import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import { setupContentTranslationEndpoints } from "__support__/server-mocks/content-translation";
import { setupEmbedDashboardParameterRemappingEndpoint } from "__support__/server-mocks/embed";
import { screen, waitFor } from "__support__/ui";
import { registerDashboardVisualizations } from "metabase/dashboard/visualizations/register";
import * as localization from "metabase/utils/localization";
import { DASHBOARD_PDF_EXPORT_ROOT_ID } from "metabase/visualizations/lib/save-dashboard-pdf";
import type { FieldValue, ParameterValue } from "metabase-types/api";
import {
  createMockHeadingDashboardCard,
  createMockParameter,
  createMockTextDashboardCard,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { MOCK_TOKEN, type SetupOpts, setup } from "./setup";

registerDashboardVisualizations();

const loadLocalizationSpy = jest.spyOn(localization, "loadLocalization");

const DASHBOARD_TITLE = '"My test dash"';

const setupPremium = async (opts?: Partial<SetupOpts>) => {
  return await setup({
    ...opts,
    enterprisePlugins: ["whitelabel", "resource_downloads"],
    tokenFeatures: createMockTokenFeatures({
      // the `whitelabel` feature is needed to test #downloads=false
      whitelabel: true,
    }),
    dashboardTitle: DASHBOARD_TITLE,
  });
};

describe("PublicOrEmbeddedDashboardPage", () => {
  beforeEach(() => {
    loadLocalizationSpy.mockClear();
    setupLastDownloadFormatEndpoints();
  });

  it("should not display the header if title is disabled and there is only one tab (metabase#41393) and downloads are disabled", async () => {
    await setupPremium({
      hash: { titled: "false", downloads: "false" },
      numberOfTabs: 1,
    });

    expect(screen.queryByText("Tab 1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("embed-frame-header")).not.toBeInTheDocument();
  });

  describe("downloads flag", () => {
    it("should show the 'Download as PDF' button even when titled=false and there's one tab", async () => {
      await setupPremium({ hash: { titled: "false" }, numberOfTabs: 1 });

      expect(
        screen.getByRole("button", { name: "Download as PDF" }),
      ).toBeInTheDocument();
    });

    it('should not show the "Download as PDF" button when downloads are disabled', async () => {
      await setupPremium({ hash: { downloads: "false" }, numberOfTabs: 1 });

      expect(
        screen.queryByRole("button", { name: "Download as PDF" }),
      ).not.toBeInTheDocument();
    });

    it("should allow downloading the dashcards results when downloads are enabled", async () => {
      await setupPremium({ numberOfTabs: 1, hash: { downloads: "true" } });

      const ellipsisIcon = screen.queryByLabelText("ellipsis icon");
      expect(ellipsisIcon).toBeInTheDocument();
      await userEvent.click(ellipsisIcon!);
      await waitFor(() => {
        expect(screen.getByLabelText("Download results")).toBeInTheDocument();
      });
    });

    it("should not allow downloading the dashcards results when downloads are disabled", async () => {
      await setupPremium({ numberOfTabs: 1, hash: { downloads: "false" } });

      expect(screen.queryByLabelText("ellipsis icon")).not.toBeInTheDocument();

      expect(
        screen.queryByRole("button", { name: "Download results" }),
      ).not.toBeInTheDocument();
    });

    it("should use the container used for pdf exports", async () => {
      const { container } = await setupPremium({ numberOfTabs: 1 });

      expect(
        // eslint-disable-next-line testing-library/no-node-access
        container.querySelector(`#${DASHBOARD_PDF_EXPORT_ROOT_ID}`),
      ).toBeInTheDocument();
    });
  });

  describe("locale hash parameter on static embeds (metabase#50182)", () => {
    it('should set the locale to "en" by default', async () => {
      await setupPremium();

      expect(
        screen.getByRole("button", { name: "Download as PDF" }),
      ).toBeInTheDocument();
    });

    it('should set the locale to "ko"', async () => {
      const expectedLocale = "ko";
      await setupPremium({ hash: { locale: expectedLocale } });

      expect(loadLocalizationSpy).toHaveBeenCalledWith(expectedLocale);
    });
  });

  describe("content translation", () => {
    const setupWithTranslations = (opts: Partial<SetupOpts>) =>
      setup({
        dashboardTitle: DASHBOARD_TITLE,
        enterprisePlugins: ["whitelabel", "content_translation"],
        tokenFeatures: createMockTokenFeatures({
          whitelabel: true,
          content_translation: true,
        }),
        hash: { locale: "de" },
        ...opts,
      });

    it.each<{
      name: string;
      type: string;
      values: ParameterValue[];
      queryString: string;
      remapping?: FieldValue;
    }>([
      {
        name: "with a label",
        type: "number/=",
        values: [
          ["1", "Gadget"],
          ["2", "Widget"],
        ],
        queryString: "?static_list=1",
        remapping: ["1", "Gadget"],
      },
      {
        name: "without a label",
        type: "string/=",
        values: [["Gadget"], ["Widget"]],
        queryString: "?static_list=Gadget",
      },
    ])(
      "should translate the selected static-list filter value $name",
      async ({ type, values, queryString, remapping }) => {
        setupContentTranslationEndpoints({
          dictionary: [{ locale: "de", msgid: "Gadget", msgstr: "Gerät" }],
        });
        if (remapping) {
          setupEmbedDashboardParameterRemappingEndpoint(
            MOCK_TOKEN,
            "static-list-id",
            remapping,
          );
        }
        await setupWithTranslations({
          queryString,
          parameterTarget: [
            "dimension",
            ["expression", "Thing", { "base-type": "type/Integer" }],
            { "stage-number": 0 },
          ],
          parameters: [
            createMockParameter({
              id: "static-list-id",
              name: "Static list",
              slug: "static_list",
              type,
              values_source_type: "static-list",
              values_source_config: { values },
            }),
          ],
        });

        expect(
          await screen.findByTestId("parameter-value-widget-target"),
        ).toHaveTextContent("Gerät");
      },
    );

    it("should translate dashboard tab names, heading cards and text cards", async () => {
      setupContentTranslationEndpoints({
        dictionary: [
          { locale: "de", msgid: "Tab 1", msgstr: "Reiter 1" },
          { locale: "de", msgid: "Tab 2", msgstr: "Reiter 2" },
          {
            locale: "de",
            msgid: "Sample Heading",
            msgstr: "Beispielüberschrift",
          },
          { locale: "de", msgid: "Sample Text", msgstr: "Beispieltext" },
        ],
      });
      await setupWithTranslations({
        numberOfTabs: 2,
        virtualDashcards: [
          createMockHeadingDashboardCard({
            id: 10,
            dashboard_tab_id: 1,
            text: "Sample Heading",
          }),
          createMockTextDashboardCard({
            id: 11,
            dashboard_tab_id: 1,
            text: "Sample Text",
          }),
        ],
      });

      expect(
        await screen.findByRole("tab", { name: "Reiter 1" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Reiter 2" })).toBeInTheDocument();
      expect(screen.getByText("Beispielüberschrift")).toBeInTheDocument();
      expect(screen.getByText("Beispieltext")).toBeInTheDocument();

      const dictionaryUrls = fetchMock.callHistory
        .calls("express:/api/ee/content-translation/dictionary/:token")
        .map((call) => new URL(call.url));
      expect(dictionaryUrls).toHaveLength(1);
      expect(dictionaryUrls[0].pathname).toMatch(
        /^\/api\/ee\/content-translation\/dictionary\/ey/,
      );
      expect(dictionaryUrls[0].searchParams.get("locale")).toBe("de");
    });
  });
});
