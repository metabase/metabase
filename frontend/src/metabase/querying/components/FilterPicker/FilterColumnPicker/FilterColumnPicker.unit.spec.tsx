import { setupFieldsValuesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, fireEvent } from "__support__/ui";
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
  test("The info icon should exist on each column", () => {
    const query = createQuery();
    const stageIndex = 0;
    setup({ query, stageIndex });
    expect(screen.getAllByLabelText("More info").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  test("Searching by displayName should works (#39622)", () => {
    const query = createQuery();
    const stageIndex = 0;
    setup({ query, stageIndex });

    screen.getByText("User").click();
    fireEvent.change(screen.getByTestId("list-search-field"), {
      target: { value: "Birth Date" },
    });

    expect(
      screen.getByRole("option", { name: "Birth Date" }),
    ).toBeInTheDocument();
  });
});
