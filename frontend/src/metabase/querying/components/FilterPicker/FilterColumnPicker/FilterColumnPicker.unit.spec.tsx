import { setupFieldsValuesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import type * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";
import { SAMPLE_DB_FIELD_VALUES } from "metabase-types/api/mocks/presets";

import { FilterColumnPicker } from "./FilterColumnPicker";

interface SetupOpts {
  query: Lib.Query;
  stageIndex: number;
}

function setup({ query, stageIndex }: SetupOpts) {
  setupFieldsValuesEndpoints(SAMPLE_DB_FIELD_VALUES);
  renderWithProviders(
    <FilterColumnPicker
      query={query}
      stageIndex={stageIndex}
      checkItemIsSelected={() => false}
      onColumnSelect={jest.fn()}
      onSegmentSelect={jest.fn()}
      onExpressionSelect={jest.fn()}
    />,
  );
}

describe("FilterModal", () => {
  const query = createQuery();
  const stageIndex = 0;
  setup({ query, stageIndex });

  test("The info icon should exist on each column", async () => {
    screen.getAllByTestId("dimension-list-item").forEach(function (item) {
      expect(within(item).getByLabelText("More info")).toBeInTheDocument();
    });
  });
});
