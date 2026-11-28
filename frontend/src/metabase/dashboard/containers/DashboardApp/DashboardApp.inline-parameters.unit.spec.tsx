import userEvent from "@testing-library/user-event";

import { screen, waitFor, within } from "__support__/ui";
import type { Dashboard } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";
import { isObject } from "metabase-types/guards";

import {
  AVERAGE_TOTAL_BY_CATEGORY_CARD,
  CATEGORY_COUNTS,
  CATEGORY_PARAMETER,
  CATEGORY_TARGET,
  COUNT_PARAMETER,
  COUNT_TARGET,
  ORDERS_COUNT_BY_CATEGORY_CARD,
  addQuestion,
  clickDone,
  clickRemove,
  createQuestionDashcard,
  getDashcard,
  getDashcards,
  getEditingHeaderFilters,
  getEditingWidget,
  getHeaderFilters,
  getLastDashcardQueryBody,
  getMapper,
  getParameterSidebar,
  getQueryParameters,
  getSavedDashboard,
  getSearchParams,
  getTableRows,
  getWidgetTarget,
  queryEditingWidgetNames,
  queryWidgetNames,
  saveDashboard,
  selectMappingColumn,
  setup,
  setupAddableAverageTotalCard,
  startEditing,
} from "./tests/parameters-setup";

const QUESTION_DASHCARD_ID = 1;
// the id that the mocked backend gives the first new dashcard
const DUPLICATED_DASHCARD_ID = 100;

const ALL_CATEGORY_ROWS = CATEGORY_COUNTS.map(
  ([category, count]) => `${category}${count.toLocaleString("en-US")}`,
);

const ONLY_OWN_CARD_MESSAGE = "This filter can only connect to its own card.";

function expectNotConnectable(dashcard: HTMLElement) {
  const mapper = getMapper(dashcard);
  expect(mapper).toHaveTextContent(ONLY_OWN_CARD_MESSAGE);
  expect(mapper).not.toHaveTextContent("Category");
  expect(within(mapper).queryByRole("button")).not.toBeInTheDocument();
}

function getSavedDashcards(dashboard: unknown): unknown[] {
  if (!isObject(dashboard) || !Array.isArray(dashboard.dashcards)) {
    return [];
  }
  const dashcards: unknown[] = dashboard.dashcards;
  return dashcards;
}

function getSavedDashcardMappingCount(dashboard: unknown) {
  return getSavedDashcards(dashboard).map((dashcard) =>
    isObject(dashcard) && Array.isArray(dashcard.parameter_mappings)
      ? dashcard.parameter_mappings.length
      : 0,
  );
}

function getSavedParameterId(dashboard: unknown, slug: string): unknown {
  if (!isObject(dashboard) || !Array.isArray(dashboard.parameters)) {
    return undefined;
  }
  const parameters: unknown[] = dashboard.parameters;
  const parameter = parameters
    .filter(isObject)
    .find((parameter) => parameter.slug === slug);
  return parameter?.id;
}

function startsWith(name: string) {
  return expect.stringMatching(new RegExp(`^${name}`));
}

async function pickValues(values: string[], buttonName: string) {
  const popover = await screen.findByTestId("parameter-value-dropdown");
  for (const value of values) {
    await userEvent.click(await within(popover).findByLabelText(value));
  }
  await userEvent.click(
    within(popover).getByRole("button", { name: buttonName }),
  );
}

describe("DashboardApp > inline parameters", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("question dashcards", () => {
    it("should edit a filter and remove it with the dashcard", async () => {
      const { router } = await setup({
        dashboard: {
          parameters: [CATEGORY_PARAMETER],
          dashcards: [
            createQuestionDashcard({
              id: QUESTION_DASHCARD_ID,
              size_x: 12,
              inlineParameters: [CATEGORY_PARAMETER.id],
              mappings: [
                { parameterId: CATEGORY_PARAMETER.id, target: CATEGORY_TARGET },
              ],
            }),
          ],
        },
      });

      await startEditing();
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
      await selectMappingColumn(getDashcard(0), "Count");
      await clickDone();
      await saveDashboard();

      const dashcard = getDashcard(0);
      expect(queryWidgetNames(dashcard)).toEqual(["Count: 4,000"]);
      await waitFor(() =>
        expect(getTableRows(dashcard)).toEqual(["Doohickey3,976"]),
      );
      expect(getSearchParams(router.location.search)).toEqual({
        count: "4000",
      });
      expect(
        getQueryParameters(getLastDashcardQueryBody(QUESTION_DASHCARD_ID)),
      ).toEqual([
        { id: CATEGORY_PARAMETER.id, target: COUNT_TARGET, value: [4000] },
      ]);

      await startEditing();
      await userEvent.click(
        within(getDashcard(0)).getByLabelText("close icon"),
      );
      await saveDashboard();
      expect(await getSavedDashboard()).toMatchObject({
        parameters: [],
        dashcards: [],
      });
    });

    it("should send both the header and the card filter values, so the card shows rows that match both (prefer the more granular filter)", async () => {
      const headerCategoryParameter = createMockParameter({
        ...CATEGORY_PARAMETER,
        id: "header-category",
        name: "Header Category",
        slug: "header-category",
      });
      await setup({
        dashboard: {
          parameters: [headerCategoryParameter, CATEGORY_PARAMETER],
          dashcards: [
            createQuestionDashcard({
              id: QUESTION_DASHCARD_ID,
              inlineParameters: [CATEGORY_PARAMETER.id],
              mappings: [
                { parameterId: CATEGORY_PARAMETER.id, target: CATEGORY_TARGET },
                {
                  parameterId: headerCategoryParameter.id,
                  target: CATEGORY_TARGET,
                },
              ],
            }),
          ],
        },
      });
      const expectRows = (rows: string[]) =>
        waitFor(() => expect(getTableRows(getDashcard(0))).toEqual(rows));
      const expectQueryValues = (
        headerValue: string[] | null,
        cardValue: string[] | null,
      ) =>
        waitFor(() =>
          expect(
            getQueryParameters(getLastDashcardQueryBody(QUESTION_DASHCARD_ID)),
          ).toEqual([
            {
              id: headerCategoryParameter.id,
              target: CATEGORY_TARGET,
              value: headerValue,
            },
            {
              id: CATEGORY_PARAMETER.id,
              target: CATEGORY_TARGET,
              value: cardValue,
            },
          ]),
        );

      await expectRows(ALL_CATEGORY_ROWS);

      await userEvent.click(
        within(getHeaderFilters()).getByText("Header Category"),
      );
      await pickValues(["Doohickey", "Gizmo"], "Add filter");
      await expectQueryValues(["Doohickey", "Gizmo"], null);
      await expectRows(["Doohickey3,976", "Gizmo4,784"]);

      await userEvent.click(getWidgetTarget(getDashcard(0), "Category"));
      await pickValues(["Gadget"], "Add filter");
      await expectQueryValues(["Doohickey", "Gizmo"], ["Gadget"]);
      expect(
        await within(getDashcard(0)).findByText(/No results/),
      ).toBeInTheDocument();

      await userEvent.click(getWidgetTarget(getDashcard(0), "Category"));
      await pickValues(["Gadget", "Gizmo"], "Update filter");
      await expectQueryValues(["Doohickey", "Gizmo"], ["Gizmo"]);
      await expectRows(["Gizmo4,784"]);
      expect(queryWidgetNames(getDashcard(0))).toEqual(["Category: Gizmo"]);

      await userEvent.click(
        getWidgetTarget(getHeaderFilters(), "Header Category"),
      );
      await pickValues(["Gadget"], "Update filter");
      await expectQueryValues(["Doohickey", "Gizmo", "Gadget"], ["Gizmo"]);
      expect(
        within(getHeaderFilters()).getByText("3 selections"),
      ).toBeInTheDocument();
      await expectRows(["Gizmo4,784"]);
      expect(queryWidgetNames(getDashcard(0))).toEqual(["Category: Gizmo"]);
    });

    it("should show all inline filters while one is edited, and remove both", async () => {
      await setup({
        dashboard: {
          parameters: [CATEGORY_PARAMETER, COUNT_PARAMETER],
          dashcards: [
            createQuestionDashcard({
              id: QUESTION_DASHCARD_ID,
              inlineParameters: [CATEGORY_PARAMETER.id, COUNT_PARAMETER.id],
              mappings: [
                { parameterId: CATEGORY_PARAMETER.id, target: CATEGORY_TARGET },
              ],
            }),
          ],
        },
      });

      // a filter that is not linked to any card is hidden
      expect(queryWidgetNames(getDashcard(0))).toEqual(["Category"]);

      await startEditing();
      const allNames = [startsWith("Category"), startsWith("Count")];
      expect(queryEditingWidgetNames(getDashcard(0))).toEqual(allNames);

      await userEvent.click(getEditingWidget(getDashcard(0), "Category"));
      expect(within(getParameterSidebar()).getByLabelText("Label")).toHaveValue(
        "Category",
      );
      expect(queryEditingWidgetNames(getDashcard(0))).toEqual(allNames);

      await userEvent.click(getEditingWidget(getDashcard(0), "Count"));
      await waitFor(() =>
        expect(
          within(getParameterSidebar()).getByLabelText("Label"),
        ).toHaveValue("Count"),
      );
      expect(queryEditingWidgetNames(getDashcard(0))).toEqual(allNames);
      await clickDone();

      await userEvent.click(getEditingWidget(getDashcard(0), "Count"));
      await clickRemove();
      await waitFor(() =>
        expect(queryEditingWidgetNames(getDashcard(0))).toEqual([
          startsWith("Category"),
        ]),
      );
      await userEvent.click(getEditingWidget(getDashcard(0), "Category"));
      await clickRemove();
      await waitFor(() =>
        expect(queryEditingWidgetNames(getDashcard(0))).toEqual([]),
      );

      await saveDashboard();
      expect(await getSavedDashboard()).toMatchObject({
        parameters: [],
        dashcards: [
          expect.objectContaining({
            id: QUESTION_DASHCARD_ID,
            inline_parameters: [],
            parameter_mappings: [],
          }),
        ],
      });
      // the card has its data again, so the filters would show by now
      await waitFor(() =>
        expect(getTableRows(getDashcard(0))).toEqual(ALL_CATEGORY_ROWS),
      );
      expect(queryWidgetNames(getDashcard(0))).toEqual([]);
      expect(
        within(getDashcard(0)).queryByText("Category"),
      ).not.toBeInTheDocument();
      // the column header
      expect(within(getDashcard(0)).getAllByText("Count")).toHaveLength(1);
    });

    it("should not auto-wire inline filters to other cards, or to cards on another tab", async () => {
      setupAddableAverageTotalCard();
      await setup({
        dashboard: {
          parameters: [CATEGORY_PARAMETER, COUNT_PARAMETER],
          dashcards: [
            createQuestionDashcard({
              id: QUESTION_DASHCARD_ID,
              inlineParameters: [CATEGORY_PARAMETER.id, COUNT_PARAMETER.id],
              mappings: [
                { parameterId: CATEGORY_PARAMETER.id, target: CATEGORY_TARGET },
              ],
            }),
          ],
        },
      });

      await startEditing();
      await addQuestion(AVERAGE_TOTAL_BY_CATEGORY_CARD.name);
      expect(
        await within(getDashcard(1)).findByText("Average of Total"),
      ).toBeInTheDocument();

      await userEvent.click(getEditingWidget(getDashcard(0), "Category"));
      expect(getMapper(getDashcard(0))).toHaveTextContent("Product.Category");
      expectNotConnectable(getDashcard(1));
      expect(screen.queryByTestId("toast-undo")).not.toBeInTheDocument();

      await userEvent.click(
        within(getMapper(getDashcard(0))).getByLabelText("Disconnect"),
      );
      expect(getMapper(getDashcard(0))).toHaveTextContent("Select…");
      await selectMappingColumn(getDashcard(0), "Category");
      expect(getMapper(getDashcard(0))).toHaveTextContent("Product.Category");
      expectNotConnectable(getDashcard(1));
      expect(screen.queryByTestId("toast-undo")).not.toBeInTheDocument();
      await clickDone();

      // inline filters can't connect to cards on another tab
      await userEvent.click(screen.getByLabelText("Create new tab"));
      await userEvent.click(screen.getByRole("tab", { name: "Tab 2" }));
      await addQuestion(AVERAGE_TOTAL_BY_CATEGORY_CARD.name);
      expect(
        await within(getDashcard(0)).findByText("Average of Total"),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole("tab", { name: "Tab 1" }));
      await userEvent.click(getEditingWidget(getDashcard(0), "Category"));
      await userEvent.click(screen.getByRole("tab", { name: "Tab 2" }));
      expect(
        await within(getDashcard(0)).findByText(
          "The selected filter is on another tab.",
        ),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole("tab", { name: "Tab 1" }));

      // disconnect the filter from its card through the sidebar
      await userEvent.click(
        await within(getParameterSidebar()).findByRole("button", {
          name: "Disconnect from card",
        }),
      );
      expect(getMapper(getDashcard(0))).toHaveTextContent("Select…");
      expectNotConnectable(getDashcard(1));
    });

    it("should duplicate inline filters and their mappings with a dashcard", async () => {
      const dashboard: Partial<Dashboard> = {
        auto_apply_filters: false,
        parameters: [CATEGORY_PARAMETER, COUNT_PARAMETER],
        dashcards: [
          createQuestionDashcard({
            id: QUESTION_DASHCARD_ID,
            inlineParameters: [CATEGORY_PARAMETER.id],
            mappings: [
              { parameterId: CATEGORY_PARAMETER.id, target: CATEGORY_TARGET },
            ],
          }),
        ],
      };
      const { router } = await setup({ dashboard });

      await startEditing();
      await userEvent.click(
        within(getEditingHeaderFilters()).getByText("Count"),
      );
      await selectMappingColumn(getDashcard(0), "Count");
      await clickDone();

      await userEvent.click(within(getDashcard(0)).getByLabelText("Duplicate"));
      await waitFor(() => expect(getDashcards()).toHaveLength(2));
      expect(queryEditingWidgetNames(getDashcard(0))).toEqual([
        startsWith("Category"),
      ]);
      expect(queryEditingWidgetNames(getDashcard(1))).toEqual([
        startsWith("Category 1"),
      ]);

      // the header filter is connected to the new card
      await userEvent.click(
        within(getEditingHeaderFilters()).getByText("Count"),
      );
      expect(getMapper(getDashcard(1))).toHaveTextContent("Count");
      await clickDone();

      // the filter of the first card is not connected to the new card
      await userEvent.click(getEditingWidget(getDashcard(0), "Category"));
      expect(getMapper(getDashcard(0))).toHaveTextContent("Product.Category");
      expectNotConnectable(getDashcard(1));
      await clickDone();

      // the filter of the new card is connected to the new card
      await userEvent.click(getEditingWidget(getDashcard(1), "Category 1"));
      expect(getMapper(getDashcard(1))).toHaveTextContent("Product.Category");
      expect(getDashcard(0)).toHaveTextContent(ONLY_OWN_CARD_MESSAGE);

      await saveDashboard();
      const savedDashboard = await getSavedDashboard();
      expect(savedDashboard).toMatchObject({
        parameters: [
          { id: CATEGORY_PARAMETER.id, slug: "category" },
          { id: COUNT_PARAMETER.id, slug: "count" },
          { name: "Category 1", slug: "category_1", type: "string/=" },
        ],
      });
      const newParameterId = getSavedParameterId(savedDashboard, "category_1");
      expect(savedDashboard).toMatchObject({
        dashcards: [
          {
            id: QUESTION_DASHCARD_ID,
            inline_parameters: [CATEGORY_PARAMETER.id],
            parameter_mappings: [
              { parameter_id: CATEGORY_PARAMETER.id, target: CATEGORY_TARGET },
              { parameter_id: COUNT_PARAMETER.id, target: COUNT_TARGET },
            ],
          },
          {
            card_id: ORDERS_COUNT_BY_CATEGORY_CARD.id,
            inline_parameters: [newParameterId],
            parameter_mappings: expect.arrayContaining([
              expect.objectContaining({
                parameter_id: newParameterId,
                target: CATEGORY_TARGET,
              }),
              expect.objectContaining({
                parameter_id: COUNT_PARAMETER.id,
                target: COUNT_TARGET,
              }),
            ]),
          },
        ],
      });
      expect(getSavedDashcardMappingCount(savedDashboard)).toEqual([2, 2]);

      // the filters work independently
      await userEvent.click(getWidgetTarget(getHeaderFilters(), "Count"));
      await userEvent.type(
        await screen.findByPlaceholderText("Enter a number"),
        "5000",
      );
      await userEvent.click(screen.getByRole("button", { name: "Add filter" }));
      await userEvent.click(getWidgetTarget(getDashcard(0), "Category"));
      await pickValues(["Widget"], "Add filter");
      await userEvent.click(getWidgetTarget(getDashcard(1), "Category 1"));
      await pickValues(["Doohickey"], "Add filter");
      await userEvent.click(
        within(await screen.findByTestId("filter-apply-toast")).getByRole(
          "button",
          { name: "Apply" },
        ),
      );

      expect(
        await within(getDashcard(0)).findByText(/No results/),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(getTableRows(getDashcard(1))).toEqual(["Doohickey3,976"]),
      );
      expect(getSearchParams(router.location.search)).toEqual({
        category: "Widget",
        category_1: "Doohickey",
        count: "5000",
      });
      expect(
        getQueryParameters(getLastDashcardQueryBody(QUESTION_DASHCARD_ID)),
      ).toEqual([
        {
          id: CATEGORY_PARAMETER.id,
          target: CATEGORY_TARGET,
          value: ["Widget"],
        },
        { id: COUNT_PARAMETER.id, target: COUNT_TARGET, value: [5000] },
      ]);
      expect(
        getQueryParameters(getLastDashcardQueryBody(DUPLICATED_DASHCARD_ID)),
      ).toEqual([
        { id: COUNT_PARAMETER.id, target: COUNT_TARGET, value: [5000] },
        { id: newParameterId, target: CATEGORY_TARGET, value: ["Doohickey"] },
      ]);
    });
  });
});
