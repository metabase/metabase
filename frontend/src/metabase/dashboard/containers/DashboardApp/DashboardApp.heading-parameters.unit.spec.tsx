import userEvent from "@testing-library/user-event";

import { screen, waitFor, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import {
  createMockDashboardCard,
  createMockParameterMapping,
  createMockVirtualCard,
  createMockVirtualDashCard,
} from "metabase-types/api/mocks";
import { ORDERS, PRODUCTS } from "metabase-types/api/mocks/presets";
import { isObject } from "metabase-types/guards";

import {
  AVERAGE_TOTAL_BY_CATEGORY_CARD,
  CATEGORY_PARAMETER,
  CATEGORY_TARGET,
  COUNT_PARAMETER,
  COUNT_TARGET,
  DASHBOARD_ID,
  ORDERS_COUNT_BY_CATEGORY_CARD,
  TAB_1,
  TAB_2,
  addQuestion,
  clickDone,
  clickRemove,
  createHeadingDashcard,
  createQuestionDashcard,
  getDashcard,
  getDashcards,
  getEditingHeaderFilters,
  getEditingWidget,
  getLastDashcardQueryBody,
  getMapper,
  getParameterSidebar,
  getQueryParameters,
  getSavedDashboard,
  getSearchParams,
  getTableRows,
  getWidget,
  queryEditingWidgetNames,
  queryWidgetNames,
  saveDashboard,
  selectMappingColumn,
  setup,
  setupAddableAverageTotalCard,
  startEditing,
  undo,
} from "./tests/parameters-setup";

const HEADING_DASHCARD_ID = 1;
const QUESTION_DASHCARD_ID = 2;

// the target that the mapping UI creates for the category column
const CATEGORY_UI_TARGET = [
  "dimension",
  [
    "field",
    PRODUCTS.CATEGORY,
    { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
  ],
  { "stage-number": 0 },
];

function getParameterId(dashboard: unknown, name: string) {
  const parameters =
    isObject(dashboard) && Array.isArray(dashboard.parameters)
      ? dashboard.parameters.filter(isObject)
      : [];
  return parameters.find((parameter) => parameter.name === name)?.id;
}

const TEXT_DASHCARD_ID = 3;
const TEXT_CARD = createMockVirtualCard({ display: "text" });

function queryHeaderWidgetNames() {
  const container = screen.queryByTestId(
    "dashboard-parameters-widget-container",
  );
  return container ? queryWidgetNames(container) : [];
}

async function editText(text: string) {
  await userEvent.click(
    within(getDashcard(0)).getByTestId("editing-dashboard-text-preview"),
  );
  const textarea = within(getDashcard(0)).getByTestId(
    "editing-dashboard-text-input",
  );
  await userEvent.clear(textarea);
  await userEvent.type(textarea, text);
}

function getQuestionDashcard() {
  return checkNotNull(
    getDashcards().find((dashcard) =>
      within(dashcard).queryByText(ORDERS_COUNT_BY_CATEGORY_CARD.name),
    ),
  );
}

function getDashcardWithWidget(name: string) {
  return checkNotNull(
    getDashcards().find((dashcard) =>
      within(dashcard)
        .queryAllByTestId("parameter-widget")
        .some(
          (widget) =>
            widget.textContent?.replace(/\s/g, " ").split(":")[0] === name,
        ),
    ),
  );
}

function getDashcardWithEditingWidget(name: string) {
  return checkNotNull(
    getDashcards().find((dashcard) =>
      queryEditingWidgetNames(dashcard).includes(name),
    ),
  );
}

async function selectFilterValue(
  container: HTMLElement,
  filterName: string,
  value: string,
) {
  await userEvent.click(
    within(getWidget(container, filterName)).getByText(filterName),
  );
  await userEvent.click(await screen.findByLabelText(value));
  await userEvent.click(screen.getByRole("button", { name: "Add filter" }));
}

async function addAverageTotalCard() {
  await addQuestion(AVERAGE_TOTAL_BY_CATEGORY_CARD.name);
  expect(
    await within(getDashcard(2)).findByText("Average of Total"),
  ).toBeInTheDocument();
}

async function removeDashcard(dashcard: HTMLElement) {
  await userEvent.click(within(dashcard).getByLabelText("close icon"));
}

describe("DashboardApp > heading dashcard parameters", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should hide unlinked filters and remove filters", async () => {
    await setup({
      dashboard: {
        parameters: [CATEGORY_PARAMETER, COUNT_PARAMETER],
        dashcards: [
          createHeadingDashcard({
            id: HEADING_DASHCARD_ID,
            inlineParameters: [CATEGORY_PARAMETER.id, COUNT_PARAMETER.id],
          }),
          createQuestionDashcard({
            id: QUESTION_DASHCARD_ID,
            row: 1,
            size_x: 12,
            mappings: [
              { parameterId: CATEGORY_PARAMETER.id, target: CATEGORY_TARGET },
            ],
          }),
        ],
      },
    });

    expect(queryWidgetNames(getDashcard(0))).toEqual(["Category"]);

    await startEditing();
    await userEvent.click(getEditingWidget(getDashcard(0), "Count"));
    await clickRemove();
    expect(
      within(getDashcard(0)).getByDisplayValue("Heading Text"),
    ).toBeInTheDocument();
    expect(queryEditingWidgetNames(getDashcard(0))).toEqual(["Category"]);

    await userEvent.click(getEditingWidget(getDashcard(0), "Category"));
    await clickRemove();
    expect(queryEditingWidgetNames(getDashcard(0))).toEqual([]);
    await saveDashboard();

    const savedDashboard = await getSavedDashboard();
    expect(savedDashboard).toMatchObject({
      parameters: [],
      dashcards: [
        expect.objectContaining({
          id: HEADING_DASHCARD_ID,
          inline_parameters: [],
          parameter_mappings: [],
        }),
        expect.objectContaining({
          id: QUESTION_DASHCARD_ID,
          inline_parameters: [],
          parameter_mappings: [],
        }),
      ],
    });
    await waitFor(() =>
      expect(
        within(getDashcard(0)).getByText("Heading Text"),
      ).toBeInTheDocument(),
    );
    expect(queryWidgetNames(getDashcard(0))).toEqual([]);
    expect(screen.queryByText("Category")).not.toBeInTheDocument();
  });

  it("should restore a removed heading with Undo, edit its filter, and remove the filter with the heading (VIZ-1236)", async () => {
    const { router } = await setup({
      dashboard: {
        parameters: [CATEGORY_PARAMETER],
        dashcards: [
          createHeadingDashcard({
            id: HEADING_DASHCARD_ID,
            inlineParameters: [CATEGORY_PARAMETER.id],
          }),
          createQuestionDashcard({
            id: QUESTION_DASHCARD_ID,
            row: 1,
            size_x: 12,
            mappings: [
              { parameterId: CATEGORY_PARAMETER.id, target: CATEGORY_TARGET },
            ],
          }),
        ],
      },
    });

    await startEditing();
    await removeDashcard(getDashcard(0));
    expect(getDashcards()).toHaveLength(1);
    expect(
      within(getDashcard(0)).getByText(ORDERS_COUNT_BY_CATEGORY_CARD.name),
    ).toBeInTheDocument();
    await undo();

    await userEvent.click(getEditingWidget(getDashcard(0), "Category"));
    expect(getMapper(getDashcard(1))).toHaveTextContent("Product.Category");
    await clickDone();

    await userEvent.click(getEditingWidget(getDashcard(0), "Category"));
    const sidebar = getParameterSidebar();
    await userEvent.clear(within(sidebar).getByLabelText("Label"));
    await userEvent.type(within(sidebar).getByLabelText("Label"), "Count");
    await userEvent.click(
      within(sidebar).getByDisplayValue("Text or Category"),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Number" }),
    );
    await userEvent.click(within(sidebar).getByDisplayValue("Equal to"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Less than or equal to" }),
    );
    await userEvent.click(
      within(within(sidebar).getByLabelText("Default value")).getByRole(
        "button",
      ),
    );
    await userEvent.type(
      await screen.findByPlaceholderText("Enter a number"),
      "4000",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add filter" }));
    await selectMappingColumn(getDashcard(1), "Count");
    await clickDone();
    await saveDashboard();

    expect(queryWidgetNames(getDashcard(0))).toEqual(["Count: 4,000"]);
    await waitFor(() =>
      expect(getTableRows(getDashcard(1))).toEqual(["Doohickey3,976"]),
    );
    expect(getSearchParams(router.location.search)).toEqual({ count: "4000" });
    expect(
      getQueryParameters(getLastDashcardQueryBody(QUESTION_DASHCARD_ID)),
    ).toEqual([
      { id: CATEGORY_PARAMETER.id, target: COUNT_TARGET, value: [4000] },
    ]);

    await startEditing();
    await removeDashcard(getDashcard(0));
    expect(getDashcards()).toHaveLength(1);
    expect(
      within(getDashcard(0)).getByText(ORDERS_COUNT_BY_CATEGORY_CARD.name),
    ).toBeInTheDocument();
    await undo();
    expect(queryEditingWidgetNames(getDashcard(0))).toEqual([
      expect.stringMatching(/^Count/),
    ]);
    await removeDashcard(getDashcard(0));
    await saveDashboard();

    expect(await getSavedDashboard()).toMatchObject({
      parameters: [],
      dashcards: [
        expect.objectContaining({
          id: QUESTION_DASHCARD_ID,
          card_id: ORDERS_COUNT_BY_CATEGORY_CARD.id,
          inline_parameters: [],
          parameter_mappings: [],
        }),
      ],
    });
  });

  it("should not auto-wire inline filters to other cards", async () => {
    setupAddableAverageTotalCard();
    await setup({
      dashboard: {
        parameters: [CATEGORY_PARAMETER, COUNT_PARAMETER],
        dashcards: [
          createHeadingDashcard({
            id: HEADING_DASHCARD_ID,
            inlineParameters: [CATEGORY_PARAMETER.id, COUNT_PARAMETER.id],
          }),
          createQuestionDashcard({
            id: QUESTION_DASHCARD_ID,
            row: 1,
            size_x: 12,
          }),
        ],
      },
    });

    await startEditing();
    await userEvent.click(getEditingWidget(getDashcard(0), "Category"));
    await selectMappingColumn(getDashcard(1), "Category");
    await clickDone();

    await addAverageTotalCard();

    await userEvent.click(getEditingWidget(getDashcard(0), "Category"));
    expect(getMapper(getDashcard(1))).toHaveTextContent("Product.Category");
    expect(getMapper(getDashcard(2))).toHaveTextContent("Select…");
    expect(getMapper(getDashcard(2))).not.toHaveTextContent("Category");
    expect(screen.queryByTestId("toast-undo")).not.toBeInTheDocument();

    await userEvent.click(
      within(getMapper(getDashcard(1))).getByLabelText("Disconnect"),
    );
    expect(getMapper(getDashcard(1))).toHaveTextContent("Select…");
    await selectMappingColumn(getDashcard(1), "Category");
    expect(getMapper(getDashcard(1))).toHaveTextContent("Product.Category");
    expect(getMapper(getDashcard(2))).toHaveTextContent("Select…");
    expect(getMapper(getDashcard(2))).not.toHaveTextContent("Category");
    expect(screen.queryByTestId("toast-undo")).not.toBeInTheDocument();
  });

  it("should duplicate the filters of a duplicated heading", async () => {
    const { router } = await setup({
      dashboard: {
        parameters: [CATEGORY_PARAMETER],
        dashcards: [
          createHeadingDashcard({
            id: HEADING_DASHCARD_ID,
            inlineParameters: [CATEGORY_PARAMETER.id],
          }),
          createQuestionDashcard({
            id: QUESTION_DASHCARD_ID,
            row: 1,
            size_x: 12,
            mappings: [
              { parameterId: CATEGORY_PARAMETER.id, target: CATEGORY_TARGET },
            ],
          }),
        ],
      },
    });

    await startEditing();
    await userEvent.click(within(getDashcard(0)).getByLabelText("Duplicate"));
    expect(getDashcards()).toHaveLength(3);
    const duplicatedHeading = getDashcardWithEditingWidget("Category 1");
    expect(
      within(duplicatedHeading).getByDisplayValue("Heading Text"),
    ).toBeInTheDocument();
    await userEvent.click(getEditingWidget(duplicatedHeading, "Category 1"));
    expect(getMapper(getQuestionDashcard())).toHaveTextContent("Select…");
    expect(getMapper(getQuestionDashcard())).not.toHaveTextContent("Category");
    await selectMappingColumn(getQuestionDashcard(), "Category");
    await saveDashboard();

    const savedDashboard = await getSavedDashboard();
    expect(savedDashboard).toMatchObject({
      parameters: [
        expect.objectContaining({
          id: CATEGORY_PARAMETER.id,
          slug: "category",
        }),
        expect.objectContaining({ name: "Category 1", slug: "category_1" }),
      ],
    });

    await selectFilterValue(
      getDashcardWithWidget("Category"),
      "Category",
      "Doohickey",
    );
    await waitFor(() =>
      expect(getTableRows(getQuestionDashcard())).toEqual(["Doohickey3,976"]),
    );
    expect(getSearchParams(router.location.search)).toEqual({
      category: "Doohickey",
      category_1: "",
    });

    await selectFilterValue(
      getDashcardWithWidget("Category 1"),
      "Category 1",
      "Gizmo",
    );
    expect(
      await within(getQuestionDashcard()).findByText(/No results/),
    ).toBeInTheDocument();
    expect(getSearchParams(router.location.search)).toEqual({
      category: "Doohickey",
      category_1: "Gizmo",
    });

    await userEvent.click(
      within(
        getWidget(getDashcardWithWidget("Category"), "Category"),
      ).getByLabelText("close icon"),
    );
    await waitFor(() =>
      expect(getTableRows(getQuestionDashcard())).toEqual(["Gizmo4,784"]),
    );
    expect(getSearchParams(router.location.search)).toEqual({
      category: "",
      category_1: "Gizmo",
    });
    expect(
      getQueryParameters(getLastDashcardQueryBody(QUESTION_DASHCARD_ID)),
    ).toEqual([
      { id: CATEGORY_PARAMETER.id, target: CATEGORY_TARGET, value: null },
      {
        id: getParameterId(await getSavedDashboard(), "Category 1"),
        target: CATEGORY_UI_TARGET,
        value: ["Gizmo"],
      },
    ]);
  });

  it("should hide a header filter once no text card variable is linked to it (UXW-751)", async () => {
    await setup({
      dashboard: {
        parameters: [CATEGORY_PARAMETER, COUNT_PARAMETER],
        dashcards: [
          createMockVirtualDashCard({
            id: TEXT_DASHCARD_ID,
            dashboard_id: DASHBOARD_ID,
            card: TEXT_CARD,
            size_x: 3,
            size_y: 3,
            visualization_settings: {
              text: "Value {{VAR1}} and {{VAR2}}",
              virtual_card: TEXT_CARD,
            },
            parameter_mappings: [
              createMockParameterMapping({
                parameter_id: CATEGORY_PARAMETER.id,
                card_id: TEXT_CARD.id,
                target: ["text-tag", "VAR1"],
              }),
              createMockParameterMapping({
                parameter_id: COUNT_PARAMETER.id,
                card_id: TEXT_CARD.id,
                target: ["text-tag", "VAR2"],
              }),
            ],
          }),
        ],
      },
    });
    expect(queryHeaderWidgetNames()).toEqual(["Category", "Count"]);

    await startEditing();
    await editText("Value {{{{VAR1}}");
    await saveDashboard();
    expect(await getSavedDashboard()).toMatchObject({
      dashcards: [
        expect.objectContaining({
          id: TEXT_DASHCARD_ID,
          parameter_mappings: [
            expect.objectContaining({
              parameter_id: CATEGORY_PARAMETER.id,
              target: ["text-tag", "VAR1"],
            }),
          ],
        }),
      ],
    });
    await waitFor(() => expect(queryHeaderWidgetNames()).toEqual(["Category"]));

    await startEditing();
    await editText("Value null");
    await saveDashboard();
    expect(await getSavedDashboard()).toMatchObject({
      dashcards: [
        expect.objectContaining({
          id: TEXT_DASHCARD_ID,
          parameter_mappings: [],
        }),
      ],
    });
    await waitFor(() =>
      expect(screen.queryAllByTestId("parameter-widget")).toHaveLength(0),
    );
  });

  it.each([
    {
      movedCardType: "heading",
      dashcardIndex: 0,
      movedDashcardId: HEADING_DASHCARD_ID,
    },
    {
      movedCardType: "question",
      dashcardIndex: 1,
      movedDashcardId: QUESTION_DASHCARD_ID,
    },
  ])(
    "should unwire the heading filter, but not the header filter, when moving a $movedCardType card to another tab",
    async ({ dashcardIndex, movedDashcardId }) => {
      await setup({
        dashboard: {
          parameters: [CATEGORY_PARAMETER, COUNT_PARAMETER],
          tabs: [TAB_1, TAB_2],
          dashcards: [
            {
              ...createHeadingDashcard({
                id: HEADING_DASHCARD_ID,
                inlineParameters: [COUNT_PARAMETER.id],
              }),
              dashboard_tab_id: TAB_1.id,
            },
            createMockDashboardCard({
              id: QUESTION_DASHCARD_ID,
              dashboard_id: DASHBOARD_ID,
              dashboard_tab_id: TAB_1.id,
              card_id: ORDERS_COUNT_BY_CATEGORY_CARD.id,
              card: ORDERS_COUNT_BY_CATEGORY_CARD,
              row: 1,
              size_x: 12,
              size_y: 6,
              inline_parameters: [],
              parameter_mappings: [
                createMockParameterMapping({
                  parameter_id: COUNT_PARAMETER.id,
                  card_id: ORDERS_COUNT_BY_CATEGORY_CARD.id,
                  target: COUNT_TARGET,
                }),
                createMockParameterMapping({
                  parameter_id: CATEGORY_PARAMETER.id,
                  card_id: ORDERS_COUNT_BY_CATEGORY_CARD.id,
                  target: CATEGORY_TARGET,
                }),
              ],
            }),
          ],
        },
      });

      await startEditing();
      await userEvent.hover(
        within(getDashcard(dashcardIndex)).getByLabelText("move_card icon"),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: TAB_2.name }),
      );
      expect(getDashcards()).toHaveLength(1);
      await saveDashboard();

      expect(await getSavedDashboard()).toMatchObject({
        dashcards: expect.arrayContaining([
          expect.objectContaining({
            id: movedDashcardId,
            dashboard_tab_id: TAB_2.id,
          }),
          expect.objectContaining({
            id: HEADING_DASHCARD_ID,
            inline_parameters: [COUNT_PARAMETER.id],
          }),
          expect.objectContaining({
            id: QUESTION_DASHCARD_ID,
            parameter_mappings: [
              expect.objectContaining({
                parameter_id: CATEGORY_PARAMETER.id,
                target: CATEGORY_TARGET,
              }),
            ],
          }),
        ]),
      });
    },
  );

  it("should auto-wire a header filter to an added card with the same column", async () => {
    setupAddableAverageTotalCard();
    await setup({
      dashboard: {
        parameters: [CATEGORY_PARAMETER],
        dashcards: [
          createHeadingDashcard({
            id: HEADING_DASHCARD_ID,
            inlineParameters: [],
          }),
          createQuestionDashcard({
            id: QUESTION_DASHCARD_ID,
            row: 1,
            size_x: 12,
          }),
        ],
      },
    });

    await startEditing();
    await userEvent.click(
      getEditingWidget(getEditingHeaderFilters(), "Category"),
    );
    await selectMappingColumn(getDashcard(1), "Category");
    await clickDone();
    await addAverageTotalCard();

    const toast = await screen.findByTestId("toast-undo");
    expect(toast).toHaveTextContent(
      `Auto-connect “${AVERAGE_TOTAL_BY_CATEGORY_CARD.name}” to “Category”?`,
    );
    await userEvent.click(
      within(toast).getByRole("button", { name: "Auto-connect" }),
    );
    await userEvent.click(
      getEditingWidget(getEditingHeaderFilters(), "Category"),
    );
    expect(getMapper(getDashcard(2))).toHaveTextContent("Product.Category");
  });

  it("should offer to auto-wire a header filter to other cards with the same column when it is mapped", async () => {
    await setup({
      dashboard: {
        parameters: [CATEGORY_PARAMETER],
        dashcards: [
          createHeadingDashcard({
            id: HEADING_DASHCARD_ID,
            inlineParameters: [],
          }),
          createQuestionDashcard({
            id: QUESTION_DASHCARD_ID,
            row: 1,
            size_x: 12,
          }),
          createMockDashboardCard({
            id: 3,
            dashboard_id: DASHBOARD_ID,
            card_id: AVERAGE_TOTAL_BY_CATEGORY_CARD.id,
            card: AVERAGE_TOTAL_BY_CATEGORY_CARD,
            row: 7,
            size_x: 12,
            size_y: 6,
          }),
        ],
      },
    });

    await startEditing();
    await userEvent.click(
      getEditingWidget(getEditingHeaderFilters(), "Category"),
    );
    await selectMappingColumn(getDashcard(1), "Category");
    expect(await screen.findByTestId("toast-undo")).toHaveTextContent(
      "Auto-connect this filter to all questions containing “Product.Category”?",
    );
  });
});
