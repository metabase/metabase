import dayjs from "dayjs";
import userEvent from "@testing-library/user-event";
import { render, screen, within } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import {
  createQuery,
  createQueryWithTimeFilter,
  findTimeColumn,
} from "../test-utils";
import { TimeFilterPicker } from "./TimeFilterPicker";

type SetupOpts = {
  query?: Lib.Query;
  column?: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
};

const EXPECTED_OPERATORS = [
  "Before",
  "After",
  "Between",
  "Is empty",
  "Not empty",
];

function setup({
  query = createQuery(),
  column = findTimeColumn(query),
  filter,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onBack = jest.fn();

  render(
    <TimeFilterPicker
      query={query}
      stageIndex={0}
      column={column}
      filter={filter}
      isNew={!filter}
      onChange={onChange}
      onBack={onBack}
    />,
  );

  function getNextFilterParts() {
    const [filter] = onChange.mock.lastCall;
    return Lib.timeFilterParts(query, 0, filter);
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

async function setOperator(operator: string) {
  userEvent.click(screen.getByLabelText("Filter operator"));
  userEvent.click(await screen.findByText(operator));
}

describe("TimeFilterPicker", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2020, 0, 1));
  });

  describe("new filter", () => {
    it("should render a blank editor", () => {
      setup();

      expect(screen.getByText("Time")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Before")).toBeInTheDocument();
      expect(screen.getByDisplayValue("00:00")).toBeInTheDocument();
      expect(screen.getByText("Add filter")).toBeEnabled();
    });

    it("should list operators", async () => {
      setup();

      userEvent.click(screen.getByDisplayValue("Before"));
      const listbox = await screen.findByRole("listbox");
      const options = within(listbox).getAllByRole("option");

      expect(options).toHaveLength(EXPECTED_OPERATORS.length);
      EXPECTED_OPERATORS.forEach(operatorName =>
        expect(within(listbox).getByText(operatorName)).toBeInTheDocument(),
      );
    });

    it("should apply a default filter", () => {
      const { getNextFilterParts, getNextFilterColumnName } = setup();

      userEvent.click(screen.getByText("Add filter"));

      const filterParts = getNextFilterParts();
      expect(filterParts).toMatchObject({
        operator: "<",
        column: expect.anything(),
        values: [new Date(2020, 0, 1, 0, 0)],
      });
      expect(getNextFilterColumnName()).toBe("Time");
    });

    it("should add a filter with one value", async () => {
      const { getNextFilterParts, getNextFilterColumnName } = setup();

      await setOperator("After");
      userEvent.type(screen.getByDisplayValue("00:00"), "11:15");
      userEvent.click(screen.getByText("Add filter"));

      const filterParts = getNextFilterParts();
      expect(filterParts).toMatchObject({
        operator: ">",
        column: expect.anything(),
        values: [dayjs("11:15", "HH:mm").toDate()],
      });
      expect(getNextFilterColumnName()).toBe("Time");
    });

    it("should add a filter with one value via keyboard", async () => {
      const { getNextFilterParts, getNextFilterColumnName } = setup();

      await setOperator("After");
      const input = screen.getByDisplayValue("00:00");
      userEvent.type(input, "11:15{enter}");

      expect(getNextFilterParts()).toMatchObject({
        operator: ">",
        column: expect.anything(),
        values: [dayjs("11:15", "HH:mm").toDate()],
      });
      expect(getNextFilterColumnName()).toBe("Time");
    });

    it("should add a filter with two values", async () => {
      const { getNextFilterParts, getNextFilterColumnName } = setup();

      await setOperator("Between");

      const [leftInput, rightInput] = screen.getAllByDisplayValue("00:00");
      userEvent.type(leftInput, "11:15");
      userEvent.type(rightInput, "12:30");
      userEvent.click(screen.getByText("Add filter"));

      const filterParts = getNextFilterParts();
      expect(filterParts).toMatchObject({
        operator: "between",
        column: expect.anything(),
        values: [
          dayjs("11:15", "HH:mm").toDate(),
          dayjs("12:30", "HH:mm").toDate(),
        ],
      });
      expect(getNextFilterColumnName()).toBe("Time");
    });

    it("should add a filter with two values via keyboard", async () => {
      const { getNextFilterParts, getNextFilterColumnName } = setup();

      await setOperator("Between");
      const [leftInput, rightInput] = screen.getAllByDisplayValue("00:00");
      userEvent.type(leftInput, "11:15");
      userEvent.type(rightInput, "12:30{enter}");

      expect(getNextFilterParts()).toMatchObject({
        operator: "between",
        column: expect.anything(),
        values: [
          dayjs("11:15", "HH:mm").toDate(),
          dayjs("12:30", "HH:mm").toDate(),
        ],
      });
      expect(getNextFilterColumnName()).toBe("Time");
    });

    it("should swap values when min > max", async () => {
      const { getNextFilterParts, getNextFilterColumnName } = setup();

      await setOperator("Between");

      const [leftInput, rightInput] = screen.getAllByDisplayValue("00:00");
      userEvent.type(leftInput, "12:30");
      userEvent.type(rightInput, "11:15");
      userEvent.click(screen.getByText("Add filter"));

      const filterParts = getNextFilterParts();
      expect(filterParts).toMatchObject({
        operator: "between",
        column: expect.anything(),
        values: [
          dayjs("11:15", "HH:mm").toDate(),
          dayjs("12:30", "HH:mm").toDate(),
        ],
      });
      expect(getNextFilterColumnName()).toBe("Time");
    });

    it("should add a filter with no values", async () => {
      const { getNextFilterParts, getNextFilterColumnName } = setup();

      await setOperator("Is empty");
      userEvent.click(screen.getByText("Add filter"));

      const filterParts = getNextFilterParts();
      expect(filterParts).toMatchObject({
        operator: "is-null",
        column: expect.anything(),
        values: [],
      });
      expect(getNextFilterColumnName()).toBe("Time");
    });

    it("should handle invalid input", () => {
      const { getNextFilterParts } = setup();

      userEvent.type(screen.getByDisplayValue("00:00"), "32:71");
      userEvent.click(screen.getByText("Add filter"));

      const filterParts = getNextFilterParts();
      expect(filterParts).toMatchObject({
        operator: "<",
        column: expect.anything(),
        values: [dayjs("03:59", "HH:mm").toDate()],
      });
    });

    it("should go back", () => {
      const { onBack, onChange } = setup();
      userEvent.click(screen.getByLabelText("Back"));
      expect(onBack).toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("existing filter", () => {
    describe("with one value", () => {
      it("should render a filter", () => {
        setup(
          createQueryWithTimeFilter({
            operator: ">",
            values: [dayjs("11:15", "HH:mm").toDate()],
          }),
        );

        expect(screen.getByText("Time")).toBeInTheDocument();
        expect(screen.getByDisplayValue("After")).toBeInTheDocument();
        expect(screen.getByDisplayValue("11:15")).toBeInTheDocument();
        expect(screen.getByText("Update filter")).toBeEnabled();
      });

      it("should update a filter", () => {
        const { getNextFilterParts, getNextFilterColumnName } = setup(
          createQueryWithTimeFilter({ operator: ">" }),
        );

        userEvent.type(screen.getByDisplayValue("00:00"), "20:45");
        userEvent.click(screen.getByText("Update filter"));

        const filterParts = getNextFilterParts();
        expect(filterParts).toMatchObject({
          operator: ">",
          column: expect.anything(),
          values: [dayjs("20:45", "HH:mm").toDate()],
        });
        expect(getNextFilterColumnName()).toBe("Time");
      });
    });

    describe("with two values", () => {
      it("should render a filter", () => {
        setup(
          createQueryWithTimeFilter({
            operator: "between",
            values: [
              dayjs("11:15", "HH:mm").toDate(),
              dayjs("13:00", "HH:mm").toDate(),
            ],
          }),
        );

        expect(screen.getByText("Time")).toBeInTheDocument();
        expect(screen.getByDisplayValue("Between")).toBeInTheDocument();
        expect(screen.getByDisplayValue("11:15")).toBeInTheDocument();
        expect(screen.getByDisplayValue("13:00")).toBeInTheDocument();
        expect(screen.getByText("Update filter")).toBeEnabled();
      });

      it("should update a filter", () => {
        const { getNextFilterParts, getNextFilterColumnName } = setup(
          createQueryWithTimeFilter({
            operator: "between",
            values: [
              dayjs("11:15", "HH:mm").toDate(),
              dayjs("13:00", "HH:mm").toDate(),
            ],
          }),
        );

        userEvent.type(screen.getByDisplayValue("11:15"), "8:00");
        userEvent.click(screen.getByText("Update filter"));

        let filterParts = getNextFilterParts();
        expect(filterParts).toMatchObject({
          operator: "between",
          column: expect.anything(),
          values: [
            dayjs("08:00", "HH:mm").toDate(),
            dayjs("13:00", "HH:mm").toDate(),
          ],
        });

        userEvent.type(screen.getByDisplayValue("13:00"), "17:31");
        userEvent.click(screen.getByText("Update filter"));

        filterParts = getNextFilterParts();
        expect(filterParts).toMatchObject({
          operator: "between",
          column: expect.anything(),
          values: [
            dayjs("08:00", "HH:mm").toDate(),
            dayjs("17:31", "HH:mm").toDate(),
          ],
        });
        expect(getNextFilterColumnName()).toBe("Time");
      });
    });

    describe("with no values", () => {
      it("should render a filter", () => {
        setup(
          createQueryWithTimeFilter({
            operator: "not-null",
            values: [],
          }),
        );

        expect(screen.getByText("Time")).toBeInTheDocument();
        expect(screen.getByDisplayValue("Not empty")).toBeInTheDocument();
        expect(screen.getByText("Update filter")).toBeEnabled();
      });

      it("should update a filter", async () => {
        const { getNextFilterParts, getNextFilterColumnName } = setup(
          createQueryWithTimeFilter({ operator: "not-null", values: [] }),
        );

        await setOperator("Is empty");
        userEvent.click(screen.getByText("Update filter"));

        const filterParts = getNextFilterParts();
        expect(filterParts).toMatchObject({
          operator: "is-null",
          column: expect.anything(),
          values: [],
        });
        expect(getNextFilterColumnName()).toBe("Time");
      });
    });

    it("should list operators", async () => {
      setup(createQueryWithTimeFilter({ operator: "<" }));

      userEvent.click(screen.getByDisplayValue("Before"));
      const listbox = await screen.findByRole("listbox");
      const options = within(listbox).getAllByRole("option");

      expect(options).toHaveLength(EXPECTED_OPERATORS.length);
      EXPECTED_OPERATORS.forEach(operatorName =>
        expect(within(listbox).getByText(operatorName)).toBeInTheDocument(),
      );
    });

    it("should change an operator", async () => {
      const { getNextFilterParts, getNextFilterColumnName } = setup(
        createQueryWithTimeFilter({
          operator: "<",
          values: [dayjs("11:15", "HH:mm").toDate()],
        }),
      );

      await setOperator("After");
      userEvent.click(screen.getByText("Update filter"));

      const filterParts = getNextFilterParts();
      expect(filterParts).toMatchObject({
        operator: ">",
        column: expect.anything(),
        values: [dayjs("11:15", "HH:mm").toDate()],
      });
      expect(getNextFilterColumnName()).toBe("Time");
    });

    it("should re-use values when changing an operator", async () => {
      setup(
        createQueryWithTimeFilter({
          operator: "between",
          values: [
            dayjs("11:15", "HH:mm").toDate(),
            dayjs("12:30", "HH:mm").toDate(),
          ],
        }),
      );
      const updateButton = screen.getByRole("button", {
        name: "Update filter",
      });

      expect(screen.getByDisplayValue("11:15")).toBeInTheDocument();
      expect(screen.getByDisplayValue("12:30")).toBeInTheDocument();

      await setOperator("Before");

      expect(screen.getByDisplayValue("11:15")).toBeInTheDocument();
      expect(screen.queryByDisplayValue("12:30")).not.toBeInTheDocument();
      expect(updateButton).toBeEnabled();

      await setOperator("Is empty");

      expect(screen.queryByDisplayValue("11:15")).not.toBeInTheDocument();
      expect(screen.queryByDisplayValue("12:30")).not.toBeInTheDocument();
      expect(updateButton).toBeEnabled();

      await setOperator("After");

      expect(screen.getByDisplayValue("00:00")).toBeInTheDocument();
      expect(screen.queryByDisplayValue("11:15")).not.toBeInTheDocument();
      expect(screen.queryByDisplayValue("12:30")).not.toBeInTheDocument();
      expect(updateButton).toBeEnabled();
    });

    it("should handle invalid filter value", () => {
      const { getNextFilterParts } = setup(
        createQueryWithTimeFilter({
          values: [dayjs("32:66", "HH:mm").toDate()],
        }),
      );

      // There's no particular reason why 32:66 becomes 09:06
      // We trust the TimeInput to turn it into a valid time value
      const input = screen.getByDisplayValue("09:06");
      userEvent.type(input, "11:00");
      userEvent.click(screen.getByText("Update filter"));

      const filterParts = getNextFilterParts();
      expect(filterParts).toMatchObject({
        operator: ">",
        column: expect.anything(),
        values: [dayjs("11:00", "HH:mm").toDate()],
      });
    });

    it("should go back", () => {
      const { onBack, onChange } = setup(
        createQueryWithTimeFilter({ operator: "<" }),
      );

      userEvent.click(screen.getByLabelText("Back"));

      expect(onBack).toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
