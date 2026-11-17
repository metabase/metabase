import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import _ from "underscore";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { registerDashboardVisualizations } from "metabase/dashboard/visualizations/register";
import { Route } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import type {
  DashboardCard,
  DatasetColumn,
  DictionaryArray,
  DictionaryResponse,
  Field,
  Parameter,
  ParameterId,
  ParameterTarget,
  RowValues,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardTab,
  createMockDataset,
  createMockDatasetData,
  createMockField,
  createMockHeadingDashboardCard,
  createMockParameter,
  createMockParameterValues,
  createMockTextDashboardCard,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { PublicOrEmbeddedDashboardPage } from "../PublicOrEmbeddedDashboardPage";

registerVisualizations();
registerDashboardVisualizations();

const MOCK_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJyZXNvdXJjZSI6eyJkYXNoYm9hcmQiOjExfSwicGFyYW1zIjp7fSwiaWF0IjoxNzEyNjg0NTA1LCJfZW1iZWRkaW5nX3BhcmFtcyI6e319.WbZTB-cQYh4gjh61ZzoLOcFbJ6j6RlOY3GS4fwzv3W4";

const FRENCH_CATEGORIES: DictionaryArray = [
  { locale: "fr", msgid: "Gadget", msgstr: "Le gadget" },
  { locale: "fr", msgid: "Doohickey", msgstr: "Le doohickey" },
  { locale: "fr", msgid: "Gizmo", msgstr: "Le gizmo" },
  { locale: "fr", msgid: "Widget", msgstr: "Le widget" },
];

const GERMAN_FIELD_NAMES: DictionaryArray = [
  { locale: "de", msgid: "Title", msgstr: "Titel" },
  { locale: "de", msgid: "Category", msgstr: "Kategorie" },
  { locale: "de", msgid: "Price", msgstr: "Preis" },
];

const GERMAN_FIELD_VALUES: DictionaryArray = [
  { locale: "de", msgid: "Doohickey", msgstr: "Dingsbums" },
  { locale: "de", msgid: "Gadget", msgstr: "Gerät" },
  { locale: "de", msgid: "Gizmo", msgstr: "Apparat" },
  { locale: "de", msgid: "Widget", msgstr: "Steuerelement" },
  {
    locale: "de",
    msgid: "Rustic Paper Wallet",
    msgstr: "Rustikale Papierbörse",
  },
];

const CATEGORY_COLUMN = createMockColumn({
  id: 10,
  name: "CATEGORY",
  display_name: "Category",
  base_type: "type/Text",
  effective_type: "type/Text",
  semantic_type: "type/Category",
  source: "fields",
  field_ref: ["field", 10, null],
});

const TITLE_COLUMN = createMockColumn({
  id: 11,
  name: "TITLE",
  display_name: "Title",
  base_type: "type/Text",
  effective_type: "type/Text",
  source: "fields",
  field_ref: ["field", 11, null],
});

const CATEGORY_BREAKOUT_COLUMN: DatasetColumn = {
  ...CATEGORY_COLUMN,
  source: "breakout",
};

const COUNT_COLUMN = createMockColumn({
  id: undefined,
  name: "count",
  display_name: "Count",
  base_type: "type/BigInteger",
  effective_type: "type/BigInteger",
  source: "aggregation",
  field_ref: ["aggregation", 0],
});

const COUNT_BY_CATEGORY_ROWS: RowValues[] = [
  ["Doohickey", 42],
  ["Gadget", 53],
  ["Gizmo", 51],
  ["Widget", 54],
];

type DashcardRowsHandler = (parameters: Record<string, unknown>) => RowValues[];

interface DashcardSetup {
  dashcard: DashboardCard;
  cols?: DatasetColumn[];
  rows?: RowValues[] | DashcardRowsHandler;
}

interface SetupOpts {
  locale: string;
  dictionary: DictionaryArray;
  dashcards: DashcardSetup[];
  parameters?: Parameter[];
  paramFields?: Record<ParameterId, Field[]>;
  queryString?: string;
}

function setupDictionaryEndpoint(dictionary: DictionaryArray) {
  fetchMock.get(
    "express:/api/ee/content-translation/dictionary/:token",
    (call): DictionaryResponse => {
      const url = new URL(call.url);
      const token = url.pathname.split("/").at(-1);
      const locale = url.searchParams.get("locale");
      if (token !== MOCK_TOKEN) {
        return { data: [] };
      }
      return {
        data: dictionary
          .filter((row) => row.locale === locale)
          .map((row, id) => ({ ...row, id })),
      };
    },
  );
}

function getRequestParameters(url: string): Record<string, unknown> {
  const parameters: unknown = JSON.parse(
    new URL(url).searchParams.get("parameters") ?? "{}",
  );
  return typeof parameters === "object" && parameters !== null
    ? Object.fromEntries(Object.entries(parameters))
    : {};
}

function setupDashcardEndpoint({
  dashcard,
  cols = [CATEGORY_BREAKOUT_COLUMN, COUNT_COLUMN],
  rows = COUNT_BY_CATEGORY_ROWS,
}: DashcardSetup) {
  fetchMock.get(
    `path:/api/embed/dashboard/${MOCK_TOKEN}/dashcard/${dashcard.id}/card/${dashcard.card_id}`,
    (call) =>
      createMockDataset({
        data: createMockDatasetData({
          cols,
          rows:
            typeof rows === "function"
              ? rows(getRequestParameters(call.url))
              : rows,
        }),
      }),
  );
}

async function setup({
  locale,
  dictionary,
  dashcards,
  parameters = [],
  paramFields,
  queryString = "",
}: SetupOpts) {
  const settings = mockSettings({
    "available-locales": [
      ["de", "German"],
      ["en", "English"],
      ["fr", "French"],
    ],
    "token-features": createMockTokenFeatures({
      whitelabel: true,
      content_translation: true,
    }),
  });
  setupEnterpriseOnlyPlugin("whitelabel");
  setupEnterpriseOnlyPlugin("content_translation");
  setupDatabasesEndpoints([]);
  setupDictionaryEndpoint(dictionary);
  // jsdom has no layout, and the table body is virtualized
  mockGetBoundingClientRect({ width: 800, height: 600 });

  const dashboard = createMockDashboard({
    id: 1,
    name: "Dashboard",
    parameters,
    param_fields: paramFields,
    tabs: [
      createMockDashboardTab({ id: 100, name: "Tab 1" }),
      createMockDashboardTab({ id: 101, name: "Tab 2" }),
    ],
    dashcards: dashcards.map(({ dashcard }) => dashcard),
  });
  fetchMock.get(`path:/api/embed/dashboard/${MOCK_TOKEN}`, dashboard);
  dashcards.forEach(setupDashcardEndpoint);

  const href = `/embed/dashboard/${MOCK_TOKEN}${queryString}#locale=${locale}`;
  window.history.replaceState({}, "", href);

  renderWithProviders(
    <Route
      path="embed/dashboard/:token"
      element={<PublicOrEmbeddedDashboardPage />}
    />,
    {
      storeInitialState: createMockState({ settings }),
      withRouter: true,
      initialRoute: href,
    },
  );

  expect(await screen.findByTestId("dashboard-grid")).toBeInTheDocument();
}

function getDashcardRequestParameters(dashcardId: number) {
  return fetchMock.callHistory
    .calls()
    .map(({ url }) => url)
    .filter((url) =>
      new URL(url).pathname.startsWith(
        `/api/embed/dashboard/${MOCK_TOKEN}/dashcard/${dashcardId}/`,
      ),
    )
    .map(getRequestParameters);
}

function createQuestionDashcard({
  id,
  ...cardOpts
}: Parameters<typeof createMockCard>[0] & { id: number }) {
  return createMockDashboardCard({
    id,
    card_id: id,
    dashboard_tab_id: 100,
    size_x: 24,
    size_y: 12,
    // `can_write` is false in public and embedded contexts
    card: createMockCard({ id, can_write: false, ...cardOpts }),
  });
}

describe("PublicOrEmbeddedDashboardPage > content translation", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("translates tab names, heading cards and text cards", async () => {
    await setup({
      locale: "de",
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
      dashcards: [
        {
          dashcard: createMockHeadingDashboardCard({
            id: 1,
            text: "Sample Heading",
            dashboard_tab_id: 100,
          }),
        },
        {
          dashcard: createMockTextDashboardCard({
            id: 2,
            text: "Sample Text",
            dashboard_tab_id: 100,
          }),
        },
      ],
    });

    expect(
      await screen.findByRole("tab", { name: "Reiter 1" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Reiter 2" })).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Tab 2" }),
    ).not.toBeInTheDocument();

    const [headingCard, textCard] = screen.getAllByTestId("dashcard");
    expect(
      within(headingCard).getByText("Beispielüberschrift"),
    ).toBeInTheDocument();
    expect(
      within(headingCard).queryByText("Sample Heading"),
    ).not.toBeInTheDocument();
    expect(within(textCard).getByText("Beispieltext")).toBeInTheDocument();
    expect(within(textCard).queryByText("Sample Text")).not.toBeInTheDocument();
  });

  it("translates card titles and descriptions", async () => {
    await setup({
      locale: "fr",
      dictionary: [
        {
          locale: "fr",
          msgid: "Products by Category (Pie)",
          msgstr: "Produits par catégorie (Camembert)",
        },
        {
          locale: "fr",
          msgid: "A breakdown of products by category",
          msgstr: "Une répartition des produits par catégorie",
        },
      ],
      dashcards: [
        {
          dashcard: createQuestionDashcard({
            id: 1,
            name: "Products by Category (Pie)",
            description: "A breakdown of products by category",
            display: "pie",
          }),
        },
      ],
    });

    const dashcard = screen.getByTestId("dashcard");
    expect(
      await within(dashcard).findByText("Produits par catégorie (Camembert)"),
    ).toBeInTheDocument();

    await userEvent.hover(await within(dashcard).findByLabelText("info icon"));
    expect(
      await screen.findByRole("tooltip", {
        name: "Une répartition des produits par catégorie",
      }),
    ).toBeInTheDocument();
  });

  it("translates pie slice names and keeps the colors set for the untranslated slices", async () => {
    const pieRows = [
      ["Widget", "#69C8C8"],
      ["Gadget", "#C7EAEA"],
      ["Gizmo", "#98D9D9"],
      ["Doohickey", "#F3F3F4"],
    ].map(([key, color]) => ({
      key,
      name: key,
      originalName: key,
      color,
      defaultColor: false,
      enabled: true,
      hidden: false,
      isOther: false,
    }));

    await setup({
      locale: "fr",
      dictionary: FRENCH_CATEGORIES,
      dashcards: [
        {
          dashcard: createQuestionDashcard({
            id: 1,
            name: "Products by Category (Pie)",
            display: "pie",
            visualization_settings: { "pie.rows": pieRows },
          }),
        },
      ],
    });

    const legend = await screen.findByTestId("chart-legend");
    await within(legend).findByText("Le widget");

    const legendColors = within(legend)
      .getAllByTestId(/^legend-item-/)
      .map((item) => [
        within(item).getByTestId("legend-item").textContent,
        within(item)
          .getByRole("button", { name: "Hide series" })
          .style.getPropertyValue("--legend-dot-color"),
      ]);
    expect(legendColors).toEqual([
      ["Le widget", "#69C8C8"],
      ["Le gadget", "#C7EAEA"],
      ["Le gizmo", "#98D9D9"],
      ["Le doohickey", "#F3F3F4"],
    ]);
  });

  it("renders a funnel with translated dimension labels (metabase#71488)", async () => {
    await setup({
      locale: "fr",
      dictionary: FRENCH_CATEGORIES,
      dashcards: [
        {
          dashcard: createQuestionDashcard({
            id: 1,
            name: "Products Funnel",
            display: "funnel",
            visualization_settings: {
              "funnel.metric": "count",
              "funnel.dimension": "CATEGORY",
            },
          }),
        },
      ],
    });

    const funnel = await screen.findByTestId("funnel-chart");
    await within(funnel).findByText("Le widget");
    expect(
      within(funnel)
        .getAllByTestId("funnel-chart-header")
        .map((header) => header.textContent),
    ).toEqual(["Le doohickey", "Le gadget", "Le gizmo", "Le widget"]);
  });

  it("translates column headers, string values and boolean values in tables", async () => {
    const activeColumn = createMockColumn({
      id: 12,
      name: "ACTIVE_SUBSCRIPTION",
      display_name: "Active Subscription",
      base_type: "type/Boolean",
      effective_type: "type/Boolean",
      source: "fields",
      field_ref: ["field", 12, null],
    });

    await setup({
      locale: "de",
      dictionary: [
        ...GERMAN_FIELD_NAMES,
        ...GERMAN_FIELD_VALUES,
        { locale: "de", msgid: "true", msgstr: "wahr" },
        { locale: "de", msgid: "false", msgstr: "falsch" },
      ],
      dashcards: [
        {
          dashcard: createQuestionDashcard({ id: 1, name: "Products" }),
          cols: [TITLE_COLUMN, CATEGORY_COLUMN, activeColumn],
          rows: [
            ["Rustic Paper Wallet", "Gizmo", true],
            ["Small Marble Shoes", "Doohickey", false],
            ["Enormous Aluminum Shirt", "Gadget", true],
          ],
        },
      ],
    });

    const tableHeader = await screen.findByTestId("table-header");
    expect(await within(tableHeader).findByText("Titel")).toBeInTheDocument();
    expect(within(tableHeader).getByText("Kategorie")).toBeInTheDocument();
    expect(within(tableHeader).queryByText("Title")).not.toBeInTheDocument();

    const tableBody = screen.getByTestId("table-body");
    expect(
      await within(tableBody).findByText("Rustikale Papierbörse"),
    ).toBeInTheDocument();
    expect(
      within(tableBody).queryByText("Rustic Paper Wallet"),
    ).not.toBeInTheDocument();
    expect(
      within(tableBody).getByText("Small Marble Shoes"),
    ).toBeInTheDocument();
    expect(within(tableBody).getByText("Apparat")).toBeInTheDocument();
    expect(within(tableBody).getByText("Dingsbums")).toBeInTheDocument();
    expect(within(tableBody).getByText("Gerät")).toBeInTheDocument();
    expect(within(tableBody).getAllByText("wahr")).toHaveLength(2);
    expect(within(tableBody).getAllByText("falsch")).toHaveLength(1);
    expect(within(tableBody).queryAllByText(/true/i)).toHaveLength(0);
    expect(within(tableBody).queryAllByText(/false/i)).toHaveLength(0);
  });

  it("translates renamed column titles and measure names of pivot tables (metabase#63296)", async () => {
    const titleBreakoutColumn: DatasetColumn = {
      ...TITLE_COLUMN,
      source: "breakout",
    };
    const pivotGroupingColumn = createMockColumn({
      id: undefined,
      name: "pivot-grouping",
      display_name: "pivot-grouping",
      base_type: "type/Integer",
      effective_type: "type/Integer",
      source: "breakout",
      field_ref: ["expression", "pivot-grouping"],
    });
    const dashcard = createQuestionDashcard({
      id: 1,
      name: "Pivot table",
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: ["CATEGORY", "TITLE"],
          columns: [],
          values: ["count"],
        },
        column_settings: {
          '["name","CATEGORY"]': { column_title: "Product type" },
          '["name","count"]': { column_title: "Price" },
        },
      },
    });
    fetchMock.get(
      `path:/api/embed/pivot/dashboard/${MOCK_TOKEN}/dashcard/1/card/1`,
      createMockDataset({
        data: createMockDatasetData({
          cols: [
            CATEGORY_BREAKOUT_COLUMN,
            titleBreakoutColumn,
            pivotGroupingColumn,
            COUNT_COLUMN,
          ],
          rows: [
            ["Gizmo", "Rustic Paper Wallet", 0, 1],
            ["Widget", "Small Marble Shoes", 0, 1],
            ["Gizmo", null, 1, 1],
            ["Widget", null, 1, 1],
            [null, null, 3, 2],
          ],
        }),
      }),
    );

    await setup({
      locale: "fr",
      dictionary: [
        { locale: "fr", msgid: "Product type", msgstr: "Type de produit" },
        { locale: "fr", msgid: "Category", msgstr: "La catégorie" },
        { locale: "fr", msgid: "Price", msgstr: "Le prix" },
        { locale: "fr", msgid: "Count", msgstr: "Le nombre" },
      ],
      dashcards: [{ dashcard }],
    });

    const pivotTable = await screen.findByTestId("pivot-table");
    expect(
      await within(pivotTable).findByText("Type de produit"),
    ).toBeInTheDocument();
    expect(within(pivotTable).getByText("Le prix")).toBeInTheDocument();
    expect(
      within(pivotTable).queryByText("Product type"),
    ).not.toBeInTheDocument();
    expect(within(pivotTable).queryByText("Price")).not.toBeInTheDocument();
    expect(
      within(pivotTable).queryByText("La catégorie"),
    ).not.toBeInTheDocument();
    expect(within(pivotTable).queryByText("Le nombre")).not.toBeInTheDocument();
  });

  describe("filters", () => {
    const expressionParameterMapping = (parameterId: ParameterId) => ({
      parameter_id: parameterId,
      card_id: 1,
      target: [
        "dimension",
        ["expression", "Thing", { "base-type": "type/Integer" }],
        { "stage-number": 0 },
      ] satisfies ParameterTarget,
    });

    it("translates the selected label of a static-list filter", async () => {
      fetchMock.get(
        `path:/api/embed/dashboard/${MOCK_TOKEN}/params/static-list-id/remapping`,
        (call) =>
          new URL(call.url).searchParams.get("value") === "2"
            ? ["2", "Widget"]
            : [],
      );

      const parameter = createMockParameter({
        id: "static-list-id",
        name: "Number",
        slug: "number",
        type: "number/=",
        sectionId: "number",
        values_source_type: "static-list",
        values_source_config: {
          values: [
            ["1", "Gadget"],
            ["2", "Widget"],
          ],
        },
      });

      await setup({
        locale: "de",
        dictionary: GERMAN_FIELD_VALUES,
        parameters: [parameter],
        queryString: "?number=2",
        dashcards: [
          {
            dashcard: {
              ...createQuestionDashcard({ id: 1, name: "Products" }),
              parameter_mappings: [expressionParameterMapping(parameter.id)],
            },
            cols: [TITLE_COLUMN],
            rows: [["Rustic Paper Wallet"]],
          },
        ],
      });

      const filter = screen.getByTestId("parameter-widget");
      expect(
        await within(filter).findByText("Steuerelement"),
      ).toBeInTheDocument();
      expect(within(filter).queryByText("Widget")).not.toBeInTheDocument();
    });

    it("translates the selected value of a static-list filter without labels", async () => {
      const parameter = createMockParameter({
        id: "static-list-id",
        name: "String",
        slug: "string",
        type: "string/=",
        sectionId: "string",
        values_source_type: "static-list",
        values_source_config: { values: [["Gadget"], ["Widget"]] },
      });

      await setup({
        locale: "de",
        dictionary: GERMAN_FIELD_VALUES,
        parameters: [parameter],
        queryString: "?string=Widget",
        dashcards: [
          {
            dashcard: {
              ...createQuestionDashcard({ id: 1, name: "Products" }),
              parameter_mappings: [expressionParameterMapping(parameter.id)],
            },
            cols: [TITLE_COLUMN],
            rows: [["Rustic Paper Wallet"]],
          },
        ],
      });

      const filter = screen.getByTestId("parameter-widget");
      expect(
        await within(filter).findByText("Steuerelement"),
      ).toBeInTheDocument();
      expect(within(filter).queryByText("Widget")).not.toBeInTheDocument();
    });

    it("filters by the untranslated value picked from a translated single-select list", async () => {
      const parameter = createMockParameter({
        id: "11d79abe",
        name: "Category",
        slug: "product_category",
        type: "string/=",
        sectionId: "string",
        isMultiSelect: false,
      });
      const allRows: RowValues[] = [
        ["Rustic Paper Wallet", "Gizmo"],
        ["Small Marble Shoes", "Doohickey"],
        ["Enormous Aluminum Shirt", "Gadget"],
        ["Synergistic Granite Chair", "Doohickey"],
        ["Mediocre Wooden Table", "Widget"],
        ["Heavy Duty Copper Coat", "Widget"],
      ];
      fetchMock.get(
        `path:/api/embed/dashboard/${MOCK_TOKEN}/params/${parameter.id}/values`,
        createMockParameterValues({
          values: [["Doohickey"], ["Gadget"], ["Gizmo"], ["Widget"]],
        }),
      );

      await setup({
        locale: "de",
        dictionary: [...GERMAN_FIELD_NAMES, ...GERMAN_FIELD_VALUES],
        parameters: [parameter],
        paramFields: {
          [parameter.id]: [
            createMockField({
              id: 10,
              name: "CATEGORY",
              display_name: "Category",
              base_type: "type/Text",
              effective_type: "type/Text",
              semantic_type: "type/Category",
              has_field_values: "list",
            }),
          ],
        },
        dashcards: [
          {
            dashcard: {
              ...createQuestionDashcard({ id: 1, name: "Products" }),
              parameter_mappings: [
                {
                  parameter_id: parameter.id,
                  card_id: 1,
                  target: ["dimension", ["field", 10, null]],
                },
              ],
            },
            cols: [TITLE_COLUMN, CATEGORY_COLUMN],
            rows: (parameters) => {
              const value = parameters[parameter.slug];
              if (value == null) {
                return allRows;
              }
              return _.isEqual(value, ["Widget"])
                ? allRows.filter(([, category]) => category === "Widget")
                : [];
            },
          },
        ],
      });

      const tableBody = await screen.findByTestId("table-body");
      expect(await within(tableBody).findByText("Apparat")).toBeInTheDocument();
      expect(within(tableBody).getAllByText("Dingsbums")).toHaveLength(2);
      expect(within(tableBody).getAllByText("Steuerelement")).toHaveLength(2);

      await userEvent.click(
        within(screen.getByTestId("parameter-widget")).getByText("Kategorie"),
      );
      const popover = await screen.findByTestId("parameter-value-dropdown");
      expect(within(popover).getByText("Gerät")).toBeInTheDocument();
      expect(within(popover).getByText("Dingsbums")).toBeInTheDocument();
      expect(within(popover).getByText("Apparat")).toBeInTheDocument();
      expect(within(popover).queryByText("Gadget")).not.toBeInTheDocument();
      await userEvent.click(within(popover).getByText("Steuerelement"));
      await userEvent.click(
        within(popover).getByRole("button", { name: "Add filter" }),
      );

      await waitFor(() =>
        expect(
          within(screen.getByTestId("table-body")).queryByText("Apparat"),
        ).not.toBeInTheDocument(),
      );
      expect(getDashcardRequestParameters(1).at(-1)).toEqual({
        [parameter.slug]: ["Widget"],
      });
      const filteredBody = screen.getByTestId("table-body");
      expect(within(filteredBody).getAllByText("Steuerelement")).toHaveLength(
        2,
      );
      expect(within(filteredBody).queryAllByText("Dingsbums")).toHaveLength(0);
      expect(within(filteredBody).queryAllByText("Gerät")).toHaveLength(0);
    });

    it("translates the options and the selected values of a search filter, and filters by the untranslated values", async () => {
      const parameter = createMockParameter({
        id: "52b05b6d",
        name: "Multi",
        slug: "multi",
        type: "string/=",
        sectionId: "string",
      });
      const names = [
        "Francesca Gleason",
        "Francesca Hammes",
        "Francesco Grant",
      ];
      const nameColumn = createMockColumn({
        id: 20,
        name: "NAME",
        display_name: "Name",
        base_type: "type/Text",
        effective_type: "type/Text",
        semantic_type: "type/Name",
        source: "fields",
        field_ref: ["field", 20, null],
      });
      fetchMock.get(
        `express:/api/embed/dashboard/${MOCK_TOKEN}/params/${parameter.id}/search/:query`,
        (call) => {
          const query = decodeURIComponent(
            new URL(call.url).pathname.split("/").at(-1) ?? "",
          );
          return createMockParameterValues({
            values: names
              .filter((name) => name.startsWith(query))
              .map((name) => [name]),
          });
        },
      );

      await setup({
        locale: "fr",
        dictionary: [
          {
            locale: "fr",
            msgid: "Francesca Gleason",
            msgstr: "Glacia Froskeon",
          },
          {
            locale: "fr",
            msgid: "Francesca Hammes",
            msgstr: "Hammera Francite",
          },
          {
            locale: "fr",
            msgid: "Francesco Grant",
            msgstr: "Granto Francello",
          },
        ],
        parameters: [parameter],
        paramFields: {
          [parameter.id]: [
            createMockField({
              id: 20,
              name: "NAME",
              display_name: "Name",
              base_type: "type/Text",
              effective_type: "type/Text",
              semantic_type: "type/Name",
              has_field_values: "search",
            }),
          ],
        },
        dashcards: [
          {
            dashcard: {
              ...createQuestionDashcard({ id: 1, name: "People" }),
              parameter_mappings: [
                {
                  parameter_id: parameter.id,
                  card_id: 1,
                  target: ["dimension", ["field", 20, null]],
                },
              ],
            },
            cols: [nameColumn],
            rows: (parameters) => {
              const value = parameters[parameter.slug] ?? names;
              return Array.isArray(value)
                ? names
                    .filter((name) => value.includes(name))
                    .map((name) => [name])
                : [];
            },
          },
        ],
      });

      const tableBody = await screen.findByTestId("table-body");
      expect(
        await within(tableBody).findByText("Glacia Froskeon"),
      ).toBeInTheDocument();
      expect(
        within(tableBody).getByText("Hammera Francite"),
      ).toBeInTheDocument();
      expect(
        within(tableBody).getByText("Granto Francello"),
      ).toBeInTheDocument();
      expect(
        within(tableBody).queryByText("Francesca Gleason"),
      ).not.toBeInTheDocument();
      expect(
        within(tableBody).queryByText("Francesca Hammes"),
      ).not.toBeInTheDocument();

      await userEvent.click(
        within(screen.getByTestId("parameter-widget")).getByText("Multi"),
      );
      let popover = await screen.findByTestId("parameter-value-dropdown");
      // The search matches the untranslated values
      await userEvent.type(within(popover).getByRole("combobox"), "Fran");
      await userEvent.click(
        await screen.findByRole("option", { name: "Glacia Froskeon" }),
      );
      expect(screen.queryByText("Francesca Gleason")).not.toBeInTheDocument();
      await userEvent.click(
        within(popover).getByRole("button", { name: "Add filter" }),
      );

      await waitFor(() =>
        expect(getDashcardRequestParameters(1).at(-1)).toEqual({
          [parameter.slug]: ["Francesca Gleason"],
        }),
      );
      await waitFor(() =>
        expect(
          within(screen.getByTestId("table-body")).getAllByRole("row"),
        ).toHaveLength(1),
      );
      const singleFilteredBody = screen.getByTestId("table-body");
      expect(
        within(singleFilteredBody).getByText("Glacia Froskeon"),
      ).toBeInTheDocument();
      expect(
        within(singleFilteredBody).queryByText("Hammera Francite"),
      ).not.toBeInTheDocument();
      expect(
        within(singleFilteredBody).queryByText("Francesca Gleason"),
      ).not.toBeInTheDocument();
      expect(
        within(singleFilteredBody).queryByText("Francesca Hammes"),
      ).not.toBeInTheDocument();
      expect(
        within(screen.getByTestId("parameter-widget")).getByText(
          "Glacia Froskeon",
        ),
      ).toBeInTheDocument();

      await userEvent.click(
        screen.getByTestId("parameter-value-widget-target"),
      );
      popover = await screen.findByTestId("parameter-value-dropdown");
      expect(within(popover).getByText("Glacia Froskeon")).toBeInTheDocument();
      await userEvent.type(within(popover).getByRole("combobox"), "Fran");
      await userEvent.click(
        await screen.findByRole("option", { name: "Hammera Francite" }),
      );
      await userEvent.click(
        within(popover).getByRole("button", { name: "Update filter" }),
      );

      await waitFor(() =>
        expect(getDashcardRequestParameters(1).at(-1)).toEqual({
          [parameter.slug]: ["Francesca Gleason", "Francesca Hammes"],
        }),
      );
      await waitFor(() =>
        expect(
          within(screen.getByTestId("table-body")).getAllByRole("row"),
        ).toHaveLength(2),
      );
      const filteredBody = screen.getByTestId("table-body");
      expect(
        within(filteredBody).getByText("Glacia Froskeon"),
      ).toBeInTheDocument();
      expect(
        within(filteredBody).getByText("Hammera Francite"),
      ).toBeInTheDocument();
      expect(
        within(filteredBody).queryByText("Granto Francello"),
      ).not.toBeInTheDocument();
      expect(
        within(filteredBody).queryByText("Francesca Gleason"),
      ).not.toBeInTheDocument();
      expect(
        within(filteredBody).queryByText("Francesca Hammes"),
      ).not.toBeInTheDocument();
    });
  });
});
