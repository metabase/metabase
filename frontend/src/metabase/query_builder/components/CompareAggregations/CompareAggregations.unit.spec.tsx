import { renderWithProviders, screen } from "__support__/ui";
import type * as Lib from "metabase-lib";
import { createQueryWithClauses } from "metabase-lib/test-helpers";

import { CompareAggregations } from "./CompareAggregations";

interface SetupOpts {
  query: Lib.Query;
}

const setup = ({ query }: SetupOpts) => {
  const stageIndex = -1;
  const onClose = jest.fn();
  const onSubmit = jest.fn();

  renderWithProviders(
    <CompareAggregations
      query={query}
      stageIndex={stageIndex}
      onClose={onClose}
      onSubmit={onSubmit}
    />,
  );
};

describe("CompareAggregations", () => {
  describe("1 aggregation", () => {
    it("displays the correct title", () => {
      setup({ query: createQueryWithCountAggregation() });

      expect(
        screen.getByText("Compare “Count” to previous period"),
      ).toBeInTheDocument();
    });
  });
});

function createQueryWithCountAggregation() {
  return createQueryWithClauses({
    aggregations: [{ operatorName: "count" }],
  });
}
