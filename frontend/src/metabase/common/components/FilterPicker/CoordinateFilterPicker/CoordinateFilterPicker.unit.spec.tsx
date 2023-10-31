import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockEntitiesState } from "__support__/store";
import { getMetadata } from "metabase/selectors/metadata";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import * as Lib from "metabase-lib";
import { createQuery, columnFinder } from "metabase-lib/test-helpers";
import { CoordinateFilterPicker } from "./CoordinateFilterPicker";

const storeInitialState = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
  }),
});

const metadata = getMetadata(storeInitialState);

function findLatitudeColumn(query: Lib.Query) {
  const columns = Lib.filterableColumns(query, 0);
  const findColumn = columnFinder(query, columns);
  return findColumn("PEOPLE", "LATITUDE");
}

function createFilteredQuery({
  operator = "=",
  values = [0],
  ...rest
}: Partial<Lib.CoordinateFilterParts> = {}) {
  const initialQuery = createQuery({ metadata });
  const column = findLatitudeColumn(initialQuery);

  const clause = Lib.coordinateFilterClause({
    operator,
    column,
    values,
    ...rest,
  });
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
  column = findLatitudeColumn(query),
  filter,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onBack = jest.fn();

  renderWithProviders(
    <CoordinateFilterPicker
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

describe("CoordinateFilterPicker", () => {
  describe("existing filter", () => {
    it("should re-use values when changing an operator", async () => {
      setup(createFilteredQuery({ operator: "=", values: [-100, 200] }));
      const updateButton = screen.getByRole("button", {
        name: "Update filter",
      });

      expect(screen.getByText("100.00000000° S")).toBeInTheDocument();
      expect(screen.getByText("200.00000000° N")).toBeInTheDocument();

      await setOperator("Is not");

      expect(screen.getByText("100.00000000° S")).toBeInTheDocument();
      expect(screen.getByText("200.00000000° N")).toBeInTheDocument();
      expect(updateButton).toBeEnabled();

      await setOperator("Between");

      expect(screen.getByDisplayValue("-100")).toBeInTheDocument();
      expect(screen.getByDisplayValue("200")).toBeInTheDocument();
      expect(screen.queryByText("100.00000000° S")).not.toBeInTheDocument();
      expect(screen.queryByText("200.00000000° N")).not.toBeInTheDocument();
      expect(updateButton).toBeEnabled();

      await setOperator("Greater than");

      expect(screen.getByDisplayValue("-100")).toBeInTheDocument();
      expect(screen.queryByDisplayValue("200")).not.toBeInTheDocument();
      expect(screen.queryByText("100.00000000° S")).not.toBeInTheDocument();
      expect(screen.queryByText("200.00000000° N")).not.toBeInTheDocument();
      expect(updateButton).toBeEnabled();

      await setOperator("Inside");

      expect(screen.queryByDisplayValue("-100")).not.toBeInTheDocument();
      expect(screen.queryByDisplayValue("200")).not.toBeInTheDocument();
      expect(screen.queryByText("100.00000000° S")).not.toBeInTheDocument();
      expect(screen.queryByText("200.00000000° N")).not.toBeInTheDocument();
      expect(updateButton).toBeDisabled();
    });
  });
});
