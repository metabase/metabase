import userEvent from "@testing-library/user-event";
import { createMockMetadata } from "__support__/metadata";
import { render, screen } from "__support__/ui";

import type { StructuredDatasetQuery } from "metabase-types/api";
import {
  createAdHocCard,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import * as Lib from "metabase-lib";
import * as Lib_ColumnTypes from "metabase-lib/column_types";
import Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import { createQuery, columnFinder } from "metabase-lib/test-helpers";

import { FilterPicker } from "./FilterPicker";

function createQueryWithFilter() {
  const initialQuery = createQuery();
  const columns = Lib.filterableColumns(initialQuery, 0);
  const findColumn = columnFinder(initialQuery, columns);
  const totalColumn = findColumn("ORDERS", "TOTAL");
  const clause = Lib.expressionClause(">", [totalColumn, 20], null);
  const query = Lib.filter(initialQuery, 0, clause);
  const [filter] = Lib.filters(query, 0);
  return { query, filter };
}

type SetupOpts = {
  query?: Lib.Query;
  filter?: Lib.FilterClause;
};

const metadata = createMockMetadata({ databases: [createSampleDatabase()] });

function setup({ query = createQuery(), filter }: SetupOpts = {}) {
  const dataset_query = Lib.toLegacyQuery(query) as StructuredDatasetQuery;
  const question = new Question(createAdHocCard({ dataset_query }), metadata);
  const legacyQuery = question.query() as StructuredQuery;

  const onSelect = jest.fn();
  const onSelectLegacy = jest.fn();

  render(
    <FilterPicker
      query={query}
      stageIndex={0}
      filter={filter}
      legacyQuery={legacyQuery}
      onSelect={onSelect}
      onSelectLegacy={onSelectLegacy}
    />,
  );
}

describe("FilterPicker", () => {
  describe("without a filter", () => {
    it("should list filterable columns", () => {
      setup();

      expect(screen.getByText("Order")).toBeInTheDocument();
      expect(screen.getByText("Discount")).toBeInTheDocument();

      userEvent.click(screen.getByText("Product"));
      expect(screen.getByText("Category")).toBeInTheDocument();
    });
  });

  describe("with a filter", () => {
    it("should show the filter editor", () => {
      setup(createQueryWithFilter());
      expect(screen.getByText("Update filter")).toBeInTheDocument();
    });

    it("should open the expression editor when column type isn't supported", () => {
      jest.spyOn(Lib_ColumnTypes, "isNumeric").mockReturnValue(false);
      setup(createQueryWithFilter());
      expect(screen.getByText(/Custom expression/i)).toBeInTheDocument();
    });
  });
});
