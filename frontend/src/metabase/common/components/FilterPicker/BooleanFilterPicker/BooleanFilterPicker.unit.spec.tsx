import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockEntitiesState } from "__support__/store";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import { createMockField } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  createOrdersTable,
  createPeopleTable,
  PEOPLE_ID,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import * as Lib from "metabase-lib";
import { createQuery, columnFinder } from "metabase-lib/test-helpers";
import { BooleanFilterPicker } from "./BooleanFilterPicker";

const BOOLEAN_FIELD = createMockField({
  id: 100,
  table_id: PEOPLE_ID,
  name: "IS_ACTIVE",
  display_name: "Is Active",
  base_type: "type/Boolean",
  effective_type: "type/Boolean",
  semantic_type: null,
});

const _peopleFields = createPeopleTable().fields?.filter(checkNotNull) ?? [];

const database = createSampleDatabase({
  tables: [
    createOrdersTable(),
    createPeopleTable({ fields: [..._peopleFields, BOOLEAN_FIELD] }),
  ],
});

const storeInitialState = createMockState({
  entities: createMockEntitiesState({
    databases: [database],
  }),
});

const metadata = getMetadata(storeInitialState);

function findBooleanColumn(query: Lib.Query) {
  const columns = Lib.filterableColumns(query, 0);
  const findColumn = columnFinder(query, columns);
  return findColumn("PEOPLE", "IS_ACTIVE");
}

function createFilteredQuery({
  operator = "=",
  values = [true],
}: Partial<Lib.BooleanFilterParts> = {}) {
  const initialQuery = createQuery({ metadata });
  const column = findBooleanColumn(initialQuery);

  const clause = Lib.booleanFilterClause({ operator, column, values });
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
  column = findBooleanColumn(query),
  filter,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onBack = jest.fn();

  renderWithProviders(
    <BooleanFilterPicker
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
    return Lib.booleanFilterParts(query, 0, filter);
  }

  function getNextFilterColumnName() {
    const parts = getNextFilterParts();
    const column = checkNotNull(parts?.column);
    return Lib.displayInfo(query, 0, column).longDisplayName;
  }

  return {
    query,
    column,
    getNextFilterParts,
    getNextFilterColumnName,
    onChange,
    onBack,
  };
}

type TestCase = {
  expectedOperator: string;
  expectedValues: boolean[];
  isAdvanced?: boolean;
};

const TEST_CASES: Array<[string, TestCase]> = [
  ["True", { expectedOperator: "=", expectedValues: [true] }],
  ["False", { expectedOperator: "=", expectedValues: [false] }],
  [
    "Empty",
    { expectedOperator: "is-null", expectedValues: [], isAdvanced: true },
  ],
  [
    "Not empty",
    { expectedOperator: "not-null", expectedValues: [], isAdvanced: true },
  ],
];

describe("BooleanFilterPicker", () => {
  describe("new filter", () => {
    it("should render a list of options", () => {
      setup();

      expect(screen.getByText("User → Is Active")).toBeInTheDocument();

      expect(screen.getByLabelText("True")).toBeChecked();
      expect(screen.getByLabelText("False")).not.toBeChecked();
      expect(screen.queryByText("Empty")).not.toBeInTheDocument();
      expect(screen.queryByText("Not empty")).not.toBeInTheDocument();

      userEvent.click(screen.getByRole("button", { name: "More options" }));

      expect(screen.getByLabelText("True")).toBeChecked();
      expect(screen.getByLabelText("False")).not.toBeChecked();
      expect(screen.getByLabelText("Empty")).not.toBeChecked();
      expect(screen.getByLabelText("Not empty")).not.toBeChecked();
    });

    it.each(TEST_CASES)(
      "should create a filter with the '%s' option",
      (title, { expectedOperator, expectedValues, isAdvanced }) => {
        const { getNextFilterParts, getNextFilterColumnName } = setup();

        if (isAdvanced) {
          userEvent.click(screen.getByText("More options"));
        }
        userEvent.click(screen.getByLabelText(title));
        userEvent.click(screen.getByRole("button", { name: "Add filter" }));

        const filterParts = getNextFilterParts();
        expect(filterParts?.operator).toEqual(expectedOperator);
        expect(filterParts?.values).toEqual(expectedValues);
        expect(getNextFilterColumnName()).toBe("User → Is Active");
      },
    );

    it("should go back", () => {
      const { onBack, onChange } = setup();
      userEvent.click(screen.getByLabelText("Back"));
      expect(onBack).toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("existing filter", () => {
    it("should render a list of options", () => {
      setup(
        createFilteredQuery({
          operator: "=",
          values: [false],
        }),
      );

      expect(screen.getByText("User → Is Active")).toBeInTheDocument();

      expect(screen.getByLabelText("True")).not.toBeChecked();
      expect(screen.getByLabelText("False")).toBeChecked();
      expect(screen.queryByText("Empty")).not.toBeInTheDocument();
      expect(screen.queryByText("Not empty")).not.toBeInTheDocument();

      userEvent.click(screen.getByRole("button", { name: "More options" }));

      expect(screen.getByLabelText("True")).not.toBeChecked();
      expect(screen.getByLabelText("False")).toBeChecked();
      expect(screen.getByLabelText("Empty")).not.toBeChecked();
      expect(screen.getByLabelText("Not empty")).not.toBeChecked();
    });

    it("shouldn't hide is-empty and not-empty options if they're in use", () => {
      setup(
        createFilteredQuery({
          operator: "is-null",
          values: [],
        }),
      );

      expect(screen.getByLabelText("True")).not.toBeChecked();
      expect(screen.getByLabelText("False")).not.toBeChecked();
      expect(screen.getByLabelText("Empty")).toBeChecked();
      expect(screen.getByLabelText("Not empty")).not.toBeChecked();
      expect(screen.queryByText("More options")).not.toBeInTheDocument();
    });

    it.each(TEST_CASES)(
      "should create a filter with the '%s' option",
      (title, { expectedOperator, expectedValues, isAdvanced }) => {
        const { getNextFilterParts, getNextFilterColumnName } = setup(
          createFilteredQuery(),
        );

        if (isAdvanced) {
          userEvent.click(screen.getByText("More options"));
        }
        userEvent.click(screen.getByLabelText(title));
        userEvent.click(screen.getByRole("button", { name: "Update filter" }));

        const filterParts = getNextFilterParts();
        expect(filterParts?.operator).toEqual(expectedOperator);
        expect(filterParts?.values).toEqual(expectedValues);
        expect(getNextFilterColumnName()).toBe("User → Is Active");
      },
    );

    it("should go back", () => {
      const { onBack, onChange } = setup(createFilteredQuery());
      userEvent.click(screen.getByLabelText("Back"));
      expect(onBack).toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
