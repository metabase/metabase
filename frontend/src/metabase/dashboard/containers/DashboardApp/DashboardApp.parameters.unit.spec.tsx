import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  act,
  screen,
  waitFor,
  waitForDashboardToLoad,
  within,
} from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Card,
  Dashboard,
  Parameter,
  ParameterTarget,
  QuestionDashboardCard,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDataset,
  createMockDatasetData,
  createMockNumericColumn,
  createMockParameter,
  createMockParameterMapping,
} from "metabase-types/api/mocks";
import { ORDERS, PRODUCTS } from "metabase-types/api/mocks/presets";
import { isObject } from "metabase-types/guards";

import {
  CATEGORIES,
  CATEGORY_PARAMETER,
  CATEGORY_TARGET,
  COUNT_PARAMETER,
  COUNT_TARGET,
  DASHBOARD_ID,
  DASHCARD_QUERY_URL,
  ORDERS_COUNT_BY_CATEGORY_CARD,
  TAB_1,
  TAB_2,
  clickDone,
  clickRemove,
  createHeadingDashcard,
  createQuestionDashcard,
  getDashcard,
  getEditingHeaderFilters,
  getEditingWidget,
  getHeaderFilters,
  getParameterSidebar,
  getQueryParameters,
  getSavedDashboard,
  getSearchParams,
  getTableRows,
  queryEditingWidgetNames,
  queryWidgetNames,
  saveDashboard,
  selectMappingColumn,
  setup,
  startEditing,
} from "./tests/parameters-setup";

const QUESTION_DASHCARD_ID = 1;
const HEADING_DASHCARD_ID = 2;

function getParamsRequestUrls() {
  return fetchMock.callHistory
    .calls()
    .map((call) => call.url)
    .filter((url) => url.includes(`/api/dashboard/${DASHBOARD_ID}/params/`));
}

function getDashcardQueryBodies() {
  return fetchMock.callHistory.calls(DASHCARD_QUERY_URL).map((call) => {
    const body: unknown = JSON.parse(String(call.options.body));
    return body;
  });
}

async function moveFilter(destination: string) {
  await userEvent.click(
    within(getParameterSidebar()).getByPlaceholderText("Move filter"),
  );
  const options = await screen.findAllByRole("option");
  await userEvent.click(
    checkNotNull(options.find((option) => option.textContent === destination)),
  );
}

async function addDashcardFilter(dashcard: HTMLElement, type: string) {
  await userEvent.click(within(dashcard).getByLabelText("Add a filter"));
  await userEvent.click(await screen.findByText(type));
}

async function renameFilter(name: string) {
  const label = within(getParameterSidebar()).getByLabelText("Label");
  await userEvent.clear(label);
  await userEvent.type(label, name);
  await userEvent.tab();
}

describe("DashboardApp > parameters", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("removing a parameter (metabase#17933)", () => {
    const STARTS_WITH_PARAMETER = createMockParameter({
      id: "1b9cd9f1",
      name: "Text starts with",
      slug: "text_starts_with",
      type: "string/starts-with",
      sectionId: "string",
    });
    const ENDS_WITH_PARAMETER = createMockParameter({
      id: "88a1257c",
      name: "Text ends with",
      slug: "text_ends_with",
      type: "string/ends-with",
      sectionId: "string",
    });

    // Like the backend, applies the starts-with and ends-with filters on the
    // category column in the dashcard query request, stores the values as the
    // last used ones, and returns them with the saved dashboard
    function setupStringOperatorEndpoints() {
      const lastUsedParameterValues: Dashboard["last_used_param_values"] = {};

      fetchMock.put(`path:/api/dashboard/${DASHBOARD_ID}`, (call) => {
        const body: unknown = JSON.parse(String(call.options.body));
        if (!isObject(body)) {
          throw new Error("Expected a dashboard update object");
        }
        const dashcards: unknown[] = Array.isArray(body.dashcards)
          ? body.dashcards
          : [];
        return createMockDashboard({
          // The frontend sends the dashboard in the API shape
          ...(body as Partial<Dashboard>),
          id: DASHBOARD_ID,
          dashcards: dashcards.filter(isObject).map((dashcard) =>
            createQuestionDashcard({
              // The frontend sends the dashcards in the API shape
              ...(dashcard as Partial<QuestionDashboardCard>),
              id: QUESTION_DASHCARD_ID,
            }),
          ),
          last_used_param_values: lastUsedParameterValues,
        });
      });

      fetchMock.post(DASHCARD_QUERY_URL, (call) => {
        const body: unknown = JSON.parse(String(call.options.body));
        getQueryParameters(body).forEach(({ id, value }) => {
          const isTextList =
            Array.isArray(value) &&
            value.every((item): item is string => typeof item === "string");
          if (isTextList) {
            lastUsedParameterValues[id] = value;
          } else {
            delete lastUsedParameterValues[id];
          }
        });
        const valueOf = (parameter: Parameter) => {
          const value = getQueryParameters(body).find(
            ({ id, target }) =>
              id === parameter.id &&
              JSON.stringify(target) === JSON.stringify(CATEGORY_TARGET),
          )?.value;
          return Array.isArray(value) ? String(value[0]) : undefined;
        };
        const prefix = valueOf(STARTS_WITH_PARAMETER);
        const suffix = valueOf(ENDS_WITH_PARAMETER);
        return createMockDataset({
          data: createMockDatasetData({
            cols: [
              createMockNumericColumn({
                id: PRODUCTS.CATEGORY,
                name: "CATEGORY",
                display_name: "Category",
                base_type: "type/Text",
              }),
            ],
            rows: CATEGORIES.filter(
              (category) =>
                (prefix == null || category.startsWith(prefix)) &&
                (suffix == null || category.endsWith(suffix)),
            ).map((category) => [category]),
          }),
        });
      });
    }

    async function setupStringOperatorDashboard({
      startsWithType = STARTS_WITH_PARAMETER.type,
    }: { startsWithType?: string } = {}) {
      setupStringOperatorEndpoints();
      const startsWithParameter = {
        ...STARTS_WITH_PARAMETER,
        type: startsWithType,
      };
      return setup({
        dashboard: {
          parameters: [startsWithParameter, ENDS_WITH_PARAMETER],
          dashcards: [
            createQuestionDashcard({
              id: QUESTION_DASHCARD_ID,
              parameter_mappings: [
                startsWithParameter,
                ENDS_WITH_PARAMETER,
              ].map((parameter) =>
                createMockParameterMapping({
                  parameter_id: parameter.id,
                  card_id: ORDERS_COUNT_BY_CATEGORY_CARD.id,
                  target: CATEGORY_TARGET,
                }),
              ),
            }),
          ],
        },
      });
    }

    async function setFilterText(name: string, text: string) {
      await userEvent.click(within(getHeaderFilters()).getByText(name));
      await userEvent.type(
        await screen.findByPlaceholderText("Enter some text"),
        text,
      );
      await userEvent.click(screen.getByRole("button", { name: "Add filter" }));
    }

    it("should filter by non-exact string operators without loading field values, and keep the other value after removing one", async () => {
      const { router } = await setupStringOperatorDashboard();
      await waitFor(() =>
        expect(getTableRows(getDashcard(0))).toEqual(CATEGORIES),
      );

      await setFilterText(STARTS_WITH_PARAMETER.name, "G");
      await waitFor(() =>
        expect(getTableRows(getDashcard(0))).toEqual(["Gadget", "Gizmo"]),
      );
      expect(getSearchParams(router.location.search)).toEqual({
        [STARTS_WITH_PARAMETER.slug]: "G",
        [ENDS_WITH_PARAMETER.slug]: "",
      });
      expect(getQueryParameters(getDashcardQueryBodies().at(-1))).toEqual([
        {
          id: STARTS_WITH_PARAMETER.id,
          target: CATEGORY_TARGET,
          value: ["G"],
        },
        { id: ENDS_WITH_PARAMETER.id, target: CATEGORY_TARGET, value: null },
      ]);
      expect(getParamsRequestUrls()).toEqual([]);

      await setFilterText(ENDS_WITH_PARAMETER.name, "zmo");
      await waitFor(() =>
        expect(getTableRows(getDashcard(0))).toEqual(["Gizmo"]),
      );
      expect(getSearchParams(router.location.search)).toEqual({
        [STARTS_WITH_PARAMETER.slug]: "G",
        [ENDS_WITH_PARAMETER.slug]: "zmo",
      });
      expect(getQueryParameters(getDashcardQueryBodies().at(-1))).toEqual([
        {
          id: STARTS_WITH_PARAMETER.id,
          target: CATEGORY_TARGET,
          value: ["G"],
        },
        {
          id: ENDS_WITH_PARAMETER.id,
          target: CATEGORY_TARGET,
          value: ["zmo"],
        },
      ]);
      expect(getParamsRequestUrls()).toEqual([]);

      await startEditing();
      await userEvent.click(
        getEditingWidget(getEditingHeaderFilters(), STARTS_WITH_PARAMETER.name),
      );
      await clickRemove();
      await waitFor(() =>
        expect(getSearchParams(router.location.search)).toEqual({
          [ENDS_WITH_PARAMETER.slug]: "zmo",
        }),
      );
      await saveDashboard();

      expect(await getSavedDashboard()).toMatchObject({
        parameters: [expect.objectContaining({ id: ENDS_WITH_PARAMETER.id })],
      });
      await waitFor(() =>
        expect(queryWidgetNames(getHeaderFilters())).toEqual([
          `${ENDS_WITH_PARAMETER.name}: zmo`,
        ]),
      );
      expect(getSearchParams(router.location.search)).toEqual({
        [ENDS_WITH_PARAMETER.slug]: "zmo",
      });
      await waitFor(() =>
        expect(getQueryParameters(getDashcardQueryBodies().at(-1))).toEqual([
          {
            id: ENDS_WITH_PARAMETER.id,
            target: CATEGORY_TARGET,
            value: ["zmo"],
          },
        ]),
      );
      expect(getTableRows(getDashcard(0))).toEqual(["Gizmo"]);
    });

    it("should load field values for an exact string operator (positive control)", async () => {
      await setupStringOperatorDashboard({ startsWithType: "string/=" });

      await userEvent.click(
        within(getHeaderFilters()).getByText(STARTS_WITH_PARAMETER.name),
      );
      await waitFor(() =>
        expect(getParamsRequestUrls()).toEqual([
          expect.stringContaining(`/params/${STARTS_WITH_PARAMETER.id}/values`),
        ]),
      );
    });
  });

  describe("filter type mismatch with a SQL field filter (metabase#9299, metabase#16181)", () => {
    const TEXT_PARAMETER = createMockParameter({
      id: "d245671f",
      name: "Text",
      slug: "text",
      type: "string/=",
      sectionId: "string",
      default: "Gadget",
    });
    const FILTER_TAG_TARGET: ParameterTarget = [
      "dimension",
      ["template-tag", "filter"],
      { "stage-number": 0 },
    ];

    const FIELD_FILTER_CARD = createMockCard({
      id: 3,
      name: "16181",
      display: "scalar",
      query_type: "native",
      dataset_query: Lib.toJsQuery(
        Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
          query: "select count(*) from products where {{filter}}",
          templateTags: {
            filter: {
              id: "0b004110-d64a-a413-5aa2-5a5314fc8fec",
              name: "filter",
              "display-name": "Native Filter",
              type: "dimension",
              "field-id": PRODUCTS.CATEGORY,
              "widget-type": "string/=",
              default: null,
            },
          },
        }),
      ),
    });
    const SELECT_ONE_CARD: Card = {
      ...FIELD_FILTER_CARD,
      dataset_query: Lib.toJsQuery(
        Lib.createTestNativeQuery(SAMPLE_PROVIDER, { query: "select 1" }),
      ),
    };

    // Like the backend, the field filter card counts the Gadget products, and
    // the updated card ignores the filter
    function createFieldFilterDashboard(card: Card) {
      return createMockDashboard({
        id: DASHBOARD_ID,
        name: "Test Dashboard",
        parameters: [TEXT_PARAMETER],
        dashcards: [
          createMockDashboardCard({
            id: QUESTION_DASHCARD_ID,
            dashboard_id: DASHBOARD_ID,
            card_id: card.id,
            card,
            size_x: 11,
            size_y: 6,
            parameter_mappings: [
              createMockParameterMapping({
                parameter_id: TEXT_PARAMETER.id,
                card_id: card.id,
                target: FILTER_TAG_TARGET,
              }),
            ],
          }),
        ],
      });
    }

    // Like the backend, the dashboard comes with the current version of its
    // card, the field filter card counts the Gadget products, and the updated
    // card ignores the filter
    async function setupFieldFilterDashboard() {
      let currentCard = FIELD_FILTER_CARD;
      fetchMock.get(`path:/api/dashboard/${DASHBOARD_ID}`, () =>
        createFieldFilterDashboard(currentCard),
      );
      fetchMock.post(DASHCARD_QUERY_URL, (call) => {
        const body: unknown = JSON.parse(String(call.options.body));
        const isFilteredByGadget = getQueryParameters(body).some(
          ({ id, target, value }) =>
            id === TEXT_PARAMETER.id &&
            JSON.stringify(target) === JSON.stringify(FILTER_TAG_TARGET) &&
            JSON.stringify(value) === JSON.stringify(["Gadget"]),
        );
        const hasFilterTag = currentCard === FIELD_FILTER_CARD;
        const count = hasFilterTag ? (isFilteredByGadget ? 53 : 200) : 1;
        return createMockDataset({
          data: createMockDatasetData({
            cols: [createMockNumericColumn({ name: "count" })],
            rows: [[count]],
          }),
        });
      });
      const view = await setup({
        dashboard: createFieldFilterDashboard(FIELD_FILTER_CARD),
      });
      return {
        ...view,
        updateCard: (card: Card) => {
          currentCard = card;
        },
      };
    }

    it("should only connect a matching filter type, and keep the filter value after the variable is removed", async () => {
      const { router, updateCard } = await setupFieldFilterDashboard();
      expect(await screen.findByTestId("scalar-value")).toHaveTextContent(
        /^53$/,
      );

      await startEditing();
      await userEvent.click(
        screen.getByRole("button", { name: "Add a filter or parameter" }),
      );
      await userEvent.click(await screen.findByText("ID"));
      expect(
        await within(getDashcard(0)).findByText(
          "Add a variable to this question to connect it to a dashboard filter.",
        ),
      ).toBeInTheDocument();
      expect(
        within(getDashcard(0)).queryByText("Column to filter on"),
      ).not.toBeInTheDocument();

      await userEvent.click(
        getEditingWidget(getEditingHeaderFilters(), TEXT_PARAMETER.name),
      );
      expect(
        await within(getDashcard(0)).findByText("Column to filter on"),
      ).toBeInTheDocument();
      expect(
        within(getDashcard(0)).getByRole("button", { name: /Native Filter/ }),
      ).toBeInTheDocument();

      await userEvent.click(
        within(screen.getByTestId("edit-bar")).getByRole("button", {
          name: "Cancel",
        }),
      );
      await userEvent.click(
        await screen.findByRole("button", { name: "Discard changes" }),
      );
      await waitFor(() =>
        expect(screen.queryByTestId("edit-bar")).not.toBeInTheDocument(),
      );

      updateCard(SELECT_ONE_CARD);
      await act(() => router.navigate("/"));
      await act(() => router.navigate(`/dashboard/${DASHBOARD_ID}`));
      await waitForDashboardToLoad();

      expect(getSearchParams(router.location.search)).toEqual({
        text: "Gadget",
      });
      expect(queryWidgetNames(getHeaderFilters())).toEqual(["Text: Gadget"]);
      expect(await screen.findByTestId("scalar-value")).toHaveTextContent(
        /^1$/,
      );

      await startEditing();
      await userEvent.click(
        getEditingWidget(getEditingHeaderFilters(), TEXT_PARAMETER.name),
      );
      expect(
        await within(getDashcard(0)).findByText(
          "A text variable in this card can only be connected to a text filter with Is operator.",
        ),
      ).toBeInTheDocument();
      expect(
        within(getDashcard(0)).queryByText("Column to filter on"),
      ).not.toBeInTheDocument();
    });
  });

  it("should move filters between dashcards on different tabs", async () => {
    await setup({
      dashboard: {
        tabs: [TAB_1, TAB_2],
        parameters: [CATEGORY_PARAMETER, COUNT_PARAMETER],
        dashcards: [
          createHeadingDashcard({
            id: HEADING_DASHCARD_ID,
            text: "Heading Text",
            dashboard_tab_id: TAB_2.id,
            inlineParameters: [CATEGORY_PARAMETER.id],
          }),
          createQuestionDashcard({
            id: QUESTION_DASHCARD_ID,
            dashboard_tab_id: TAB_1.id,
            row: 1,
            inline_parameters: [COUNT_PARAMETER.id],
            parameter_mappings: [
              createMockParameterMapping({
                parameter_id: COUNT_PARAMETER.id,
                card_id: ORDERS_COUNT_BY_CATEGORY_CARD.id,
                target: COUNT_TARGET,
              }),
            ],
          }),
        ],
      },
    });

    await startEditing();
    await userEvent.click(getEditingWidget(getDashcard(0), "Count"));
    await moveFilter("Heading Text");
    await clickDone();
    expect(queryEditingWidgetNames(getDashcard(0))).toEqual([]);
    expect(
      screen.queryByTestId("edit-dashboard-parameters-widget-container"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: TAB_2.name }));
    await waitFor(() =>
      expect(queryEditingWidgetNames(getDashcard(0))).toEqual([
        expect.stringMatching(/^Category/),
        expect.stringMatching(/^Count/),
      ]),
    );
    await userEvent.click(getEditingWidget(getDashcard(0), "Category"));
    await moveFilter(ORDERS_COUNT_BY_CATEGORY_CARD.name);
    await clickDone();
    expect(queryEditingWidgetNames(getDashcard(0))).toEqual([
      expect.stringMatching(/^Count/),
    ]);
    expect(
      screen.queryByTestId("edit-dashboard-parameters-widget-container"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: TAB_1.name }));
    await waitFor(() =>
      expect(queryEditingWidgetNames(getDashcard(0))).toEqual([
        expect.stringMatching(/^Category/),
      ]),
    );
    await userEvent.click(getEditingWidget(getDashcard(0), "Category"));
    await selectMappingColumn(getDashcard(0), "Category");
    await clickDone();
    await saveDashboard();

    expect(await getSavedDashboard()).toMatchObject({
      dashcards: [
        expect.objectContaining({
          id: HEADING_DASHCARD_ID,
          inline_parameters: [COUNT_PARAMETER.id],
        }),
        expect.objectContaining({
          id: QUESTION_DASHCARD_ID,
          inline_parameters: [CATEGORY_PARAMETER.id],
          // The Count filter is now on a heading on another tab, so it is
          // disconnected from the card
          parameter_mappings: [
            expect.objectContaining({
              parameter_id: CATEGORY_PARAMETER.id,
              card_id: ORDERS_COUNT_BY_CATEGORY_CARD.id,
              target: [
                "dimension",
                [
                  "field",
                  PRODUCTS.CATEGORY,
                  expect.objectContaining({
                    "source-field": ORDERS.PRODUCT_ID,
                  }),
                ],
                { "stage-number": 0 },
              ],
            }),
          ],
        }),
      ],
    });
    await waitFor(() =>
      expect(queryWidgetNames(getDashcard(0))).toEqual(["Category"]),
    );
  });

  it("should track dashboard_filter_created and dashboard_filter_moved events", async () => {
    const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
    // metabase/analytics is mocked for every test, so it keeps earlier calls
    trackSimpleEvent.mockClear();
    const getEvents = (event: string) =>
      trackSimpleEvent.mock.calls
        .map(([payload]) => payload)
        .filter((payload) => payload.event === event);
    await setup({
      dashboard: {
        dashcards: [createQuestionDashcard({ id: QUESTION_DASHCARD_ID })],
      },
    });

    await startEditing();
    await addDashcardFilter(getDashcard(0), "Text or Category");
    await renameFilter("Category");
    await selectMappingColumn(getDashcard(0), "Category");
    expect(getEvents("dashboard_filter_created")).toEqual([
      {
        event: "dashboard_filter_created",
        target_id: DASHBOARD_ID,
        triggered_from: "table",
        event_detail: "string",
      },
    ]);
    await clickDone();

    await userEvent.click(screen.getByLabelText("Add a heading or text box"));
    await userEvent.click(await screen.findByText("Heading"));
    await userEvent.type(
      screen.getByPlaceholderText(
        "You can connect widgets to {{variables}} in heading cards.",
      ),
      "Heading Text",
    );
    const headingDashcard = checkNotNull(
      screen
        .getAllByTestId("dashcard")
        .find((dashcard) =>
          within(dashcard).queryByDisplayValue("Heading Text"),
        ),
    );
    await addDashcardFilter(headingDashcard, "Text or Category");
    await renameFilter("Category 2");
    expect(getEvents("dashboard_filter_created")).toHaveLength(2);
    expect(getEvents("dashboard_filter_created").at(-1)).toEqual({
      event: "dashboard_filter_created",
      target_id: DASHBOARD_ID,
      triggered_from: "heading",
      event_detail: "string",
    });
    await clickDone();

    await userEvent.click(
      screen.getByRole("button", { name: "Add a filter or parameter" }),
    );
    await userEvent.click(await screen.findByText("ID"));
    expect(getEvents("dashboard_filter_created")).toHaveLength(3);
    expect(getEvents("dashboard_filter_created").at(-1)).toEqual({
      event: "dashboard_filter_created",
      target_id: DASHBOARD_ID,
      triggered_from: null,
      event_detail: "id",
    });

    await moveFilter(ORDERS_COUNT_BY_CATEGORY_CARD.name);
    await moveFilter("Heading Text");
    await moveFilter("Top of page");
    expect(getEvents("dashboard_filter_moved")).toEqual([
      {
        event: "dashboard_filter_moved",
        target_id: DASHBOARD_ID,
        triggered_from: null,
        event_detail: "table",
      },
      {
        event: "dashboard_filter_moved",
        target_id: DASHBOARD_ID,
        triggered_from: "table",
        event_detail: "heading",
      },
      {
        event: "dashboard_filter_moved",
        target_id: DASHBOARD_ID,
        triggered_from: "heading",
        event_detail: null,
      },
    ]);
  });
});
