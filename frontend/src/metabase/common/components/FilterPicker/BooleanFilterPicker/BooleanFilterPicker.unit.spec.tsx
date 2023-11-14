import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import {
  createQuery,
  createQueryWithBooleanFilter,
  findBooleanColumn,
  storeInitialState,
} from "../test-utils";
import { BooleanFilterPicker } from "./BooleanFilterPicker";

type SetupOpts = {
  query?: Lib.Query;
  column?: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
};

function setup({
  query = createQuery(),
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
    const [filter] = onChange.mock.lastCall;
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
        expect(filterParts).toMatchObject({
          operator: expectedOperator,
          column: expect.anything(),
          values: expectedValues,
        });
        expect(getNextFilterColumnName()).toBe("User → Is Active");
      },
    );

    it("should create a filter via keyboard", () => {
      const { getNextFilterParts, getNextFilterColumnName } = setup();

      const option = screen.getByLabelText("True");
      userEvent.click(option);
      userEvent.type(option, "{enter}");

      const filterParts = getNextFilterParts();
      expect(filterParts).toMatchObject({
        operator: "=",
        column: expect.anything(),
        values: [true],
      });
      expect(getNextFilterColumnName()).toBe("User → Is Active");
    });

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
        createQueryWithBooleanFilter({
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
        createQueryWithBooleanFilter({
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
          createQueryWithBooleanFilter(),
        );

        if (isAdvanced) {
          userEvent.click(screen.getByText("More options"));
        }
        userEvent.click(screen.getByLabelText(title));
        userEvent.click(screen.getByRole("button", { name: "Update filter" }));

        const filterParts = getNextFilterParts();
        expect(filterParts).toMatchObject({
          operator: expectedOperator,
          column: expect.anything(),
          values: expectedValues,
        });
        expect(getNextFilterColumnName()).toBe("User → Is Active");
      },
    );

    it("should go back", () => {
      const { onBack, onChange } = setup(createQueryWithBooleanFilter());
      userEvent.click(screen.getByLabelText("Back"));
      expect(onBack).toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
