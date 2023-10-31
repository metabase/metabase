import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockEntitiesState } from "__support__/store";
import { getMetadata } from "metabase/selectors/metadata";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import * as Lib from "metabase-lib";
import { createQuery, columnFinder } from "metabase-lib/test-helpers";
import { NumberFilterPicker } from "./NumberFilterPicker";

const storeInitialState = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
  }),
});

const metadata = getMetadata(storeInitialState);

function findNumericColumn(query: Lib.Query) {
  const columns = Lib.filterableColumns(query, 0);
  const findColumn = columnFinder(query, columns);
  return findColumn("ORDERS", "TOTAL");
}

function createFilteredQuery({
  operator = "=",
  values = [0],
}: Partial<Lib.NumberFilterParts> = {}) {
  const initialQuery = createQuery({ metadata });
  const column = findNumericColumn(initialQuery);

  const clause = Lib.numberFilterClause({ operator, column, values });
  const query = Lib.filter(initialQuery, 0, clause);
  const [filter] = Lib.filters(query, 0);

  return { query, column, filter };
}

type SetupOpts = {
  query?: Lib.Query;
  column?: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
};

function setup({
  query = createQuery({ metadata }),
  column = findNumericColumn(query),
  filter,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onBack = jest.fn();

  renderWithProviders(
    <NumberFilterPicker
      query={query}
      stageIndex={0}
      column={column}
      filter={filter}
      isNew={!filter}
      onChange={onChange}
      onBack={onBack}
    />,
    { storeInitialState },
  );

  function getNextFilterParts() {
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    const [filter] = lastCall;
    return Lib.numberFilterParts(query, 0, filter);
  }

  return { query, column, getNextFilterParts, onChange, onBack };
}

async function setOperator(operator: string) {
  userEvent.click(screen.getByLabelText("Filter operator"));
  userEvent.click(await screen.findByText(operator));
}

describe("NumberFilterPicker", () => {
  describe("existing filter", () => {
    it("should re-use values when changing an operator", async () => {
      setup(createFilteredQuery({ operator: "=", values: [10, 20] }));
      const updateButton = screen.getByRole("button", {
        name: "Update filter",
      });

      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("20")).toBeInTheDocument();

      await setOperator("Not equal to");

      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("20")).toBeInTheDocument();
      expect(updateButton).toBeEnabled();

      await setOperator("Greater than");

      expect(screen.getByDisplayValue("10")).toBeInTheDocument();
      expect(screen.queryByText("20")).not.toBeInTheDocument();
      expect(updateButton).toBeEnabled();

      await setOperator("Is empty");

      expect(screen.queryByText("10")).not.toBeInTheDocument();
      expect(screen.queryByText("20")).not.toBeInTheDocument();
      expect(updateButton).toBeEnabled();

      await setOperator("Equal to");

      expect(screen.queryByText("10")).not.toBeInTheDocument();
      expect(screen.queryByText("20")).not.toBeInTheDocument();
      expect(updateButton).toBeDisabled();
    });
  });
});
