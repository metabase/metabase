import userEvent from "@testing-library/user-event";

import { setupFieldsValuesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { SAMPLE_DB_FIELD_VALUES } from "metabase-types/api/mocks/presets";

import { FilterColumnPicker } from "./FilterColumnPicker";

interface SetupOpts {
  query: Lib.Query;
  stageIndexes: number[];
}

function setup({ query, stageIndexes }: SetupOpts) {
  setupFieldsValuesEndpoints(SAMPLE_DB_FIELD_VALUES);
  renderWithProviders(
    <FilterColumnPicker
      query={query}
      stageIndexes={stageIndexes}
      checkItemIsSelected={() => false}
      onColumnSelect={jest.fn()}
      onSegmentSelect={jest.fn()}
      onExpressionSelect={jest.fn()}
    />,
  );
}

describe("FilterColumnPicker", () => {
  test("The info icon should exist on each column", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    const stageIndexes = [0];
    setup({ query, stageIndexes });
    expect(screen.getAllByLabelText("More info").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("Searching by displayName should work (#39622)", async () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    const stageIndexes = [0];
    setup({ query, stageIndexes });

    await userEvent.click(screen.getByText("User"));
    await userEvent.type(screen.getByTestId("list-search-field"), "Birth Date");

    expect(
      await screen.findByRole("option", { name: "Birth Date" }),
    ).toBeInTheDocument();
  });
});
