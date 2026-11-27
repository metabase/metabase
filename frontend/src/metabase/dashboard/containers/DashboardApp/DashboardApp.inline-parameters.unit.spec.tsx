import userEvent from "@testing-library/user-event";

import { screen, waitFor, within } from "__support__/ui";
import {
  createMockDashboardCard,
  createMockParameterMapping,
} from "metabase-types/api/mocks";

import {
  CATEGORY_PARAMETER,
  CATEGORY_TARGET,
  COUNT_TARGET,
  DASHBOARD_ID,
  ORDERS_COUNT_BY_CATEGORY_CARD,
  clickDone,
  getDashcard,
  getEditingWidget,
  getLastDashcardQueryBody,
  getParameterSidebar,
  getQueryParameters,
  getSavedDashboard,
  getSearchParams,
  getTableRows,
  queryWidgetNames,
  saveDashboard,
  selectMappingColumn,
  setup,
  startEditing,
} from "./tests/parameters-setup";

const QUESTION_DASHCARD_ID = 1;

describe("DashboardApp > inline parameters", () => {
  describe("question dashcards", () => {
    it("should edit a filter and remove it with the dashcard", async () => {
      const { router } = await setup({
        dashboard: {
          parameters: [CATEGORY_PARAMETER],
          dashcards: [
            createMockDashboardCard({
              id: QUESTION_DASHCARD_ID,
              dashboard_id: DASHBOARD_ID,
              card_id: ORDERS_COUNT_BY_CATEGORY_CARD.id,
              card: ORDERS_COUNT_BY_CATEGORY_CARD,
              size_x: 12,
              size_y: 6,
              inline_parameters: [CATEGORY_PARAMETER.id],
              parameter_mappings: [
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
  });
});
