import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen, within } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";
import Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import { FilterHeader } from "./QuestionFilters";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

type SetupOpts = {
  query?: Lib.Query;
  isExpanded?: boolean;
};

function setup({
  query: initialQuery = TEST_MULTISTAGE_QUERY,
  isExpanded = true,
}: SetupOpts = {}) {
  const onChange = jest.fn();

  function WrappedFilterHeader() {
    const [query, setQuery] = useState(initialQuery);

    const question = Question.create({
      metadata,
      type: "query",
      dataset_query: Lib.toLegacyQuery(query),
    });

    const handleQueryChange = (nextLegacyQuery: StructuredQuery) => {
      const nextQuery = nextLegacyQuery.question()._getMLv2Query();
      setQuery(nextQuery);
      onChange(nextQuery);
    };

    return (
      <div data-testid="TEST_CONTAINER">
        <FilterHeader
          question={question}
          expanded={isExpanded}
          onQueryChange={handleQueryChange}
        />
      </div>
    );
  }

  renderWithProviders(<WrappedFilterHeader />);

  function getNextQuery() {
    const [nextQuery] = onChange.mock.lastCall;
    return nextQuery;
  }

  function getFilterColumnNameForStage(stageIndex: number) {
    const query = getNextQuery();
    const [filter] = Lib.filters(query, stageIndex);
    const parts = Lib.filterParts(query, stageIndex, filter);
    const column = checkNotNull(parts?.column);
    return Lib.displayInfo(query, stageIndex, column).longDisplayName;
  }

  return { getNextQuery, getFilterColumnNameForStage };
}

describe("FilterHeader", () => {
  it("should not render if a query has no filters", () => {
    setup({ query: createQuery() });
    expect(screen.queryByTestId("TEST_CONTAINER")).toBeEmptyDOMElement();
  });

  it("should not render if expanded is false", () => {
    setup({ isExpanded: false });
    expect(screen.queryByTestId("TEST_CONTAINER")).toBeEmptyDOMElement();
  });

  it("should render filters from the last two stages", () => {
    setup();
    expect(screen.getAllByTestId("filter-pill")).toHaveLength(2);
    expect(screen.getByText("Count is greater than 5")).toBeInTheDocument();
    expect(screen.getByText("User → Source is Organic")).toBeInTheDocument();
    expect(screen.queryByText(/Quantity/i)).not.toBeInTheDocument();
  });

  it("should update a filter on the last stage", async () => {
    const { getNextQuery, getFilterColumnNameForStage } = setup();

    userEvent.click(screen.getByText("User → Source is Organic"));
    userEvent.click(await screen.findByLabelText("Filter operator"));
    userEvent.click(await screen.findByText("Is empty"));
    userEvent.click(screen.getByText("Update filter"));

    expect(screen.getByText("User → Source is empty")).toBeInTheDocument();
    expect(
      screen.queryByText("User → Source is Organic"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Count is greater than 5")).toBeInTheDocument();

    const query = getNextQuery();
    expect(Lib.filters(query, 0)).toHaveLength(1);
    expect(Lib.filters(query, 1)).toHaveLength(1);
    expect(Lib.filters(query, 2)).toHaveLength(1);

    const [nextFilter] = Lib.filters(query, 2);
    const nextFilterParts = Lib.stringFilterParts(query, 2, nextFilter);
    const nextColumnName = getFilterColumnNameForStage(2);
    expect(nextFilterParts).toMatchObject({
      operator: "is-empty",
      column: expect.anything(),
      values: [],
      options: {},
    });
    expect(nextColumnName).toBe("People Via User ID Source");
  });

  it("should update a filter on the previous stage", async () => {
    const { getNextQuery, getFilterColumnNameForStage } = setup();

    userEvent.click(screen.getByText("Count is greater than 5"));
    userEvent.type(await screen.findByDisplayValue("5"), "{backspace}110");
    userEvent.click(screen.getByText("Update filter"));

    expect(screen.getByText("Count is greater than 110")).toBeInTheDocument();
    expect(
      screen.queryByText("Count is greater than 5"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("User → Source is Organic")).toBeInTheDocument();

    const query = getNextQuery();
    expect(Lib.filters(query, 0)).toHaveLength(1);
    expect(Lib.filters(query, 1)).toHaveLength(1);
    expect(Lib.filters(query, 2)).toHaveLength(1);

    const [nextFilter] = Lib.filters(query, 1);
    const nextFilterParts = Lib.numberFilterParts(query, 1, nextFilter);
    const nextColumnName = getFilterColumnNameForStage(1);
    expect(nextFilterParts).toMatchObject({
      operator: ">",
      column: expect.anything(),
      values: [110],
    });
    expect(nextColumnName).toBe("Count");
  });

  it("should remove a filter from the last stage", () => {
    const { getNextQuery } = setup();

    userEvent.click(
      within(screen.getByText("User → Source is Organic")).getByLabelText(
        "Remove",
      ),
    );

    expect(
      screen.queryByText("User → Source is Organic"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Count is greater than 5")).toBeInTheDocument();

    const query = getNextQuery();
    expect(Lib.filters(query, 0)).toHaveLength(1);
    expect(Lib.filters(query, 1)).toHaveLength(1);
    expect(Lib.filters(query, 2)).toHaveLength(0);
  });

  it("should remove a filter from the previous stage", () => {
    const { getNextQuery } = setup();

    userEvent.click(
      within(screen.getByText("Count is greater than 5")).getByLabelText(
        "Remove",
      ),
    );

    expect(
      screen.queryByText("Count is greater than 5"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("User → Source is Organic")).toBeInTheDocument();

    const query = getNextQuery();
    expect(Lib.filters(query, 0)).toHaveLength(1);
    expect(Lib.filters(query, 1)).toHaveLength(0);
    expect(Lib.filters(query, 2)).toHaveLength(1);
  });
});

/**
 * Stage 0: Count of Orders by User.Source, filtered by Orders.Quantity > 4
 * Stage 1: Count by User.Source, filtered by Count > 5
 * Stage 2: Count by user.Source, filtered by User.Source = "Organic"
 */
const TEST_MULTISTAGE_QUERY = createQuery({
  metadata,
  query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      filter: [
        "=",
        [
          "field",
          "PEOPLE__via__USER_ID__SOURCE",
          {
            "base-type": "type/Text",
          },
        ],
        "Organic",
      ],
      "source-query": {
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            "PEOPLE__via__USER_ID__SOURCE",
            {
              "base-type": "type/Text",
            },
          ],
        ],
        filter: [
          ">",
          [
            "field",
            "count",
            {
              "base-type": "type/Integer",
            },
          ],
          5,
        ],
        "source-query": {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              PEOPLE.SOURCE,
              {
                "base-type": "type/Text",
                "source-field": ORDERS.USER_ID,
              },
            ],
          ],
          filter: [
            ">",
            [
              "field",
              ORDERS.QUANTITY,
              {
                "base-type": "type/Integer",
              },
            ],
            4,
          ],
        },
      },
    },
  },
});
