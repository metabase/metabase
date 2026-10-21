import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupEmbedCardEndpoints,
  setupLastDownloadFormatEndpoints,
} from "__support__/server-mocks";
import { setupContentTranslationEndpoints } from "__support__/server-mocks/content-translation";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import type { DictionaryArray } from "metabase-types/api";
import {
  createMockColumn,
  createMockEmbedDataset,
  createMockPublicCard,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { PublicOrEmbeddedQuestion } from "../PublicOrEmbeddedQuestion";

registerVisualizations();

beforeAll(() => {
  mockGetBoundingClientRect({ width: 1200, height: 800 });
  return loadVisualizationComponents(["table"]);
});

const TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJyZXNvdXJjZSI6eyJxdWVzdGlvbiI6MjB9LCJwYXJhbXMiOnt9fQ.signature";

const GERMAN_FIELD_NAMES: DictionaryArray = [
  { locale: "de", msgid: "Title", msgstr: "Titel" },
  { locale: "de", msgid: "Vendor", msgstr: "Anbieter" },
  { locale: "de", msgid: "Rating", msgstr: "Bewertung" },
  { locale: "de", msgid: "Category", msgstr: "Kategorie" },
  { locale: "de", msgid: "Created At", msgstr: "Erstellt am" },
  { locale: "de", msgid: "Price", msgstr: "Preis" },
];

type SetupOpts = {
  locale: string;
};

async function setup({ locale }: SetupOpts) {
  mockSettings({
    "token-features": createMockTokenFeatures({
      whitelabel: true,
      content_translation: true,
    }),
  });
  setupEnterpriseOnlyPlugin("whitelabel");
  setupEnterpriseOnlyPlugin("content_translation");

  setupLastDownloadFormatEndpoints();
  setupContentTranslationEndpoints({ dictionary: GERMAN_FIELD_NAMES });
  setupEmbedCardEndpoints(
    TOKEN,
    createMockPublicCard({ id: 20, name: "Products question" }),
    createMockEmbedDataset({
      data: {
        cols: GERMAN_FIELD_NAMES.map(({ msgid }, index) =>
          createMockColumn({
            id: index + 1,
            name: msgid.toUpperCase().replace(" ", "_"),
            display_name: msgid,
          }),
        ),
        rows: [["Product", "Vendor Inc.", 4, "Gadget", "2024-01-01", 10]],
      },
    }),
  );

  renderWithProviders(
    <Route
      path="embed/question/:token"
      element={<PublicOrEmbeddedQuestion />}
    />,
    {
      storeInitialState: createMockState(),
      withRouter: true,
      initialRoute: `embed/question/${TOKEN}#locale=${locale}`,
    },
  );

  await waitFor(() =>
    expect(
      fetchMock.callHistory.called(
        "express:/api/ee/content-translation/dictionary/:token",
      ),
    ).toBe(true),
  );
  const dictionaryUrl = new URL(
    fetchMock.callHistory.lastCall(
      "express:/api/ee/content-translation/dictionary/:token",
    )?.url ?? "",
  );
  return { dictionaryUrl };
}

describe("PublicOrEmbeddedQuestion content translation", () => {
  it("should not translate column headers when the locale is English", async () => {
    const { dictionaryUrl } = await setup({ locale: "en" });

    expect(dictionaryUrl.pathname).toBe(
      `/api/ee/content-translation/dictionary/${TOKEN}`,
    );
    expect(dictionaryUrl.searchParams.get("locale")).toBe("en");

    const header = await screen.findByTestId("table-header");
    GERMAN_FIELD_NAMES.forEach(({ msgid, msgstr }) => {
      expect(within(header).getByText(msgid)).toBeInTheDocument();
      expect(within(header).queryByText(msgstr)).not.toBeInTheDocument();
    });
  });

  it("should translate column headers when the locale is German", async () => {
    const { dictionaryUrl } = await setup({ locale: "de" });

    expect(dictionaryUrl.pathname).toBe(
      `/api/ee/content-translation/dictionary/${TOKEN}`,
    );
    expect(dictionaryUrl.searchParams.get("locale")).toBe("de");

    const header = await screen.findByTestId("table-header");
    expect(await within(header).findByText("Titel")).toBeInTheDocument();
    GERMAN_FIELD_NAMES.forEach(({ msgid, msgstr }) => {
      expect(within(header).getByText(msgstr)).toBeInTheDocument();
      expect(within(header).queryByText(msgid)).not.toBeInTheDocument();
    });
  });
});
