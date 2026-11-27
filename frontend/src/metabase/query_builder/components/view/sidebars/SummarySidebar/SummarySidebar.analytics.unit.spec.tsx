import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { fireEvent, screen } from "__support__/ui";
import * as Analytics from "metabase/analytics";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { trackSummarySidebarOpened } from "./analytics";
import {
  SUMMARIZED_QUERY,
  drop,
  getFieldButton,
  getFieldDrag,
  setup,
} from "./tests/setup";
import { getValueItems } from "./utils";

const EMPTY_QUERY = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);

function setupTracking() {
  return jest.spyOn(Analytics, "trackSimpleEvent").mockClear();
}

async function pickOption(
  inputLabel: string,
  searchText: string,
  name: string,
) {
  await userEvent.type(screen.getByLabelText(inputLabel), searchText);
  const options = await screen.findAllByRole("option");
  const option = options.find((option) => option.textContent === name);
  if (!option) {
    throw new Error(`No ${name} option`);
  }
  await userEvent.click(option);
}

function createQuestion(query: Lib.Query, id?: number) {
  return new Question(
    createMockCard({ id, dataset_query: Lib.toJsQuery(query) }),
    createMockMetadata({ databases: [createSampleDatabase()] }),
  );
}

describe("SummarySidebar analytics", () => {
  describe("summary_sidebar_opened", () => {
    it("reports an unsummarized ad-hoc question as empty, with no target", () => {
      const trackSimpleEvent = setupTracking();

      trackSummarySidebarOpened(
        createQuestion(EMPTY_QUERY).setId(undefined),
        "summarize_button",
      );

      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "summary_sidebar_opened",
        triggered_from: "summarize_button",
        event_detail: "empty",
        target_id: null,
      });
    });

    it("reports a summarized saved question with its id", () => {
      const trackSimpleEvent = setupTracking();

      trackSummarySidebarOpened(
        createQuestion(SUMMARIZED_QUERY, 7),
        "column_header",
      );

      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "summary_sidebar_opened",
        triggered_from: "column_header",
        event_detail: "summarized",
        target_id: 7,
      });
    });
  });

  describe("summary_field_added", () => {
    it("tracks a field picked in the typeahead of a well", async () => {
      const trackSimpleEvent = setupTracking();
      setup();

      await pickOption("Add a grouping by name", "categ", "Category");

      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "summary_field_added",
        triggered_from: "columns",
        event_detail: "typeahead",
      });
    });

    it("tracks a click and an alt-click in the field list", async () => {
      const trackSimpleEvent = setupTracking();
      setup();

      await userEvent.click(getFieldButton("Product", "Category"));
      expect(trackSimpleEvent).toHaveBeenLastCalledWith({
        event: "summary_field_added",
        triggered_from: "columns",
        event_detail: "field_list_click",
      });

      fireEvent.click(getFieldButton("Orders", "Created At"), { altKey: true });
      expect(trackSimpleEvent).toHaveBeenLastCalledWith({
        event: "summary_field_added",
        triggered_from: "columns",
        event_detail: "field_list_alt_click",
      });
      expect(trackSimpleEvent).toHaveBeenCalledTimes(2);
    });

    it("tracks a field dropped on a well, with the well it lands in", () => {
      const trackSimpleEvent = setupTracking();
      setup();

      drop(getFieldDrag(EMPTY_QUERY, "Orders", "Total"), "values");

      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "summary_field_added",
        triggered_from: "values",
        event_detail: "drag_and_drop",
      });
    });

    it("doesn't track a pick that leaves the summary as it is", async () => {
      const trackSimpleEvent = setupTracking();
      const { onQueryChange } = setup({ query: SUMMARIZED_QUERY });

      await pickOption("Add a value by name", "count", "Count of rows");

      expect(onQueryChange).not.toHaveBeenCalled();
      expect(trackSimpleEvent).not.toHaveBeenCalled();
    });

    it("doesn't track a chip moved from one well to another", () => {
      const trackSimpleEvent = setupTracking();
      const { onQueryChange } = setup({ query: SUMMARIZED_QUERY });
      const [, sumOfTotal] = getValueItems(SUMMARIZED_QUERY, -1);

      drop({ kind: "value", item: sumOfTotal }, "columns");

      expect(onQueryChange).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).not.toHaveBeenCalled();
    });
  });

  describe("summary_pivot_mode_toggled", () => {
    it("tracks the pivot toggle turning the mode on and off", async () => {
      const trackSimpleEvent = setupTracking();
      setup();

      await userEvent.click(
        screen.getByRole("button", { name: "Pivot into rows and columns" }),
      );
      expect(trackSimpleEvent).toHaveBeenLastCalledWith({
        event: "summary_pivot_mode_toggled",
        event_detail: "enabled",
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Back to breakouts" }),
      );
      expect(trackSimpleEvent).toHaveBeenLastCalledWith({
        event: "summary_pivot_mode_toggled",
        event_detail: "disabled",
      });
      expect(trackSimpleEvent).toHaveBeenCalledTimes(2);
    });
  });
});
