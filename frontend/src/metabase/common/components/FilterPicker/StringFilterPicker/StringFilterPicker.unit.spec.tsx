import userEvent from "@testing-library/user-event";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { setupFieldsValuesEndpoints } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { getMetadata } from "metabase/selectors/metadata";
import {
  createSampleDatabase,
  PRODUCT_CATEGORY_VALUES,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import * as Lib from "metabase-lib";
import { createQuery, columnFinder } from "metabase-lib/test-helpers";
import { StringFilterPicker } from "./StringFilterPicker";

const storeInitialState = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
  }),
});

const metadata = getMetadata(storeInitialState);

function findStringColumn(query: Lib.Query) {
  const columns = Lib.filterableColumns(query, 0);
  const findColumn = columnFinder(query, columns);
  return findColumn("PRODUCTS", "CATEGORY");
}

function createFilteredQuery({
  operator = "=",
  values = ["Gadget", "Gizmo"],
}: Partial<Lib.StringFilterParts> = {}) {
  const initialQuery = createQuery({ metadata });
  const column = findStringColumn(initialQuery);

  const clause = Lib.stringFilterClause({
    operator,
    column,
    values,
    options: {},
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
  column = findStringColumn(query),
  filter,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onBack = jest.fn();

  setupFieldsValuesEndpoints([PRODUCT_CATEGORY_VALUES]);

  renderWithProviders(
    <StringFilterPicker
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
    return Lib.stringFilterParts(query, 0, filter);
  }

  return { query, column, getNextFilterParts, onChange, onBack };
}

async function setOperator(operator: string) {
  userEvent.click(screen.getByLabelText("Filter operator"));
  userEvent.click(await screen.findByText(operator));
}

describe("StringFilterPicker", () => {
  describe("new filter", () => {
    it("should handle options when changing an operator", async () => {
      setup();
      await waitForLoaderToBeRemoved();

      await setOperator("Contains");
      expect(screen.getByLabelText("Case sensitive")).not.toBeChecked();

      await setOperator("Does not contain");
      expect(screen.getByLabelText("Case sensitive")).not.toBeChecked();

      userEvent.click(screen.getByLabelText("Case sensitive"));
      await setOperator("Starts with");
      expect(screen.getByLabelText("Case sensitive")).toBeChecked();

      await setOperator("Ends with");
      expect(screen.getByLabelText("Case sensitive")).toBeChecked();

      await setOperator("Is empty");
      await setOperator("Contains");
      expect(screen.getByLabelText("Case sensitive")).not.toBeChecked();
    });
  });

  describe("existing filter", () => {
    it("should re-use values when changing an operator", async () => {
      setup(
        createFilteredQuery({ operator: "=", values: ["Gadget", "Gizmo"] }),
      );
      await waitForLoaderToBeRemoved();
      const updateButton = screen.getByRole("button", {
        name: "Update filter",
      });

      expect(screen.getByLabelText("Gadget")).toBeChecked();
      expect(screen.getByLabelText("Gizmo")).toBeChecked();

      await setOperator("Is not");

      expect(screen.getByLabelText("Gadget")).toBeChecked();
      expect(screen.getByLabelText("Gizmo")).toBeChecked();
      expect(updateButton).toBeEnabled();

      await setOperator("Contains");

      expect(screen.getByDisplayValue("Gadget")).toBeInTheDocument();
      expect(screen.queryByDisplayValue("Gizmo")).not.toBeInTheDocument();
      expect(updateButton).toBeEnabled();

      await setOperator("Is empty");

      expect(screen.queryByText("Gadget")).not.toBeInTheDocument();
      expect(screen.queryByText("Gizmo")).not.toBeInTheDocument();
      expect(updateButton).toBeEnabled();

      await setOperator("Is");

      expect(await screen.findByLabelText("Gadget")).not.toBeChecked();
      expect(screen.getByLabelText("Gizmo")).not.toBeChecked();
      expect(updateButton).toBeDisabled();
    });
  });
});
