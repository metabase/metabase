import { setupFieldsValuesEndpoints } from "__support__/server-mocks";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import type * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";
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
    const query = createQuery();
    const stageIndexes = [0];
    setup({ query, stageIndexes });
    expect(screen.getAllByLabelText("More info").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  test("Searching by displayName should works (#39622)", () => {
    const query = createQuery();
    const stageIndexes = [0];
    setup({ query, stageIndexes });

    screen.getByText("User").click();
    fireEvent.change(screen.getByTestId("list-search-field"), {
      target: { value: "Birth Date" },
    });

    expect(
      screen.getByRole("option", { name: "Birth Date" }),
    ).toBeInTheDocument();
  });
});
