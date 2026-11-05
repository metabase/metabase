import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { render, renderWithProviders, screen, within } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  columnFinder,
} from "metabase-lib/test-helpers";

import { ExpressionBar } from "./ExpressionBar";
import {
  CLOSE_PAREN,
  OPEN_PAREN,
  filterToken,
  opToken,
  toFilterClause,
  writeTokens,
} from "./tokens";

describe("ExpressionBar", () => {
  it.each([
    { hasSourceFilters: true, hasStageFilters: true, separators: 1 },
    { hasSourceFilters: false, hasStageFilters: true, separators: 0 },
    { hasSourceFilters: true, hasStageFilters: false, separators: 0 },
  ])(
    "shows $separators then separators with source filters=$hasSourceFilters and stage filters=$hasStageFilters",
    ({ hasSourceFilters, hasStageFilters, separators }) => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
      const column = columnFinder(query, Lib.filterableColumns(query, 0))(
        "ORDERS",
        "TOTAL",
      );
      const filteredQuery = Lib.filter(
        query,
        0,
        toFilterClause(
          query,
          0,
          Lib.numberFilterClause({ operator: ">", column, values: [10] }),
        ),
      );

      render(
        <ExpressionBar
          query={hasSourceFilters ? filteredQuery : query}
          stageIndex={0}
          isAutoApply
          onChange={jest.fn()}
          trailing={hasStageFilters && <span>Next stage filters</span>}
        />,
      );

      expect(screen.queryAllByText("then")).toHaveLength(separators);
    },
  );

  describe("row layout", () => {
    /** total > 1 or (total > 2 and (total > 3 or total > 4)) */
    const getNestedQuery = () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
      const column = columnFinder(query, Lib.filterableColumns(query, 0))(
        "ORDERS",
        "TOTAL",
      );
      const pill = (value: number) =>
        filterToken(
          toFilterClause(
            query,
            0,
            Lib.numberFilterClause({ operator: ">", column, values: [value] }),
          ),
        );
      return writeTokens(query, 0, [
        pill(1),
        opToken("or"),
        OPEN_PAREN,
        pill(2),
        opToken("and"),
        OPEN_PAREN,
        pill(3),
        opToken("or"),
        pill(4),
        CLOSE_PAREN,
        CLOSE_PAREN,
      ]);
    };
    const setup = ({
      query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
    }: { query?: Lib.Query } = {}) => {
      fetchMock.get("path:/api/prototype/field-categories", []);
      fetchMock.get("path:/api/prototype/filter-usage", []);
      fetchMock.get("path:/api/prototype/samples", { tables: [], columns: [] });
      renderWithProviders(
        <ExpressionBar
          query={query}
          stageIndex={0}
          isAutoApply
          onChange={jest.fn()}
          openKey={0}
        />,
      );
    };
    const typeText = (text: string) =>
      userEvent.type(screen.getByRole("textbox"), text);
    const getBar = () => screen.getByTestId("filter-expression-bar");
    const getToggle = () =>
      screen.getByRole("button", { name: "Show on multiple rows" });
    const queryToggle = () =>
      screen.queryByRole("button", { name: "Show on multiple rows" });

    it("offers the toggle only for nested parentheses, and stays on one line until it is on", async () => {
      setup();
      expect(queryToggle()).not.toBeInTheDocument();

      await typeText("(");
      expect(queryToggle()).not.toBeInTheDocument();

      await typeText("(");
      expect(getToggle()).toHaveAttribute("aria-pressed", "false");
      expect(getBar()).toHaveAttribute("data-layout", "line");
    });

    it("switches between rows and one line with the toggle", async () => {
      setup();
      await typeText("((");

      await userEvent.click(getToggle());
      expect(getToggle()).toHaveAttribute("aria-pressed", "true");
      expect(getBar()).toHaveAttribute("data-layout", "rows");

      await userEvent.click(getToggle());
      expect(getToggle()).toHaveAttribute("aria-pressed", "false");
      expect(getBar()).toHaveAttribute("data-layout", "line");
    });

    it("keeps the layout when the bar loses the focus, whichever it is", async () => {
      setup({ query: getNestedQuery() });
      expect(getToggle()).toHaveAttribute("aria-pressed", "false");
      expect(getBar()).toHaveAttribute("data-layout", "line");

      await userEvent.click(getToggle());
      await userEvent.click(document.body);

      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(getBar()).toHaveAttribute("data-layout", "rows");
      expect(getToggle()).toHaveAttribute("aria-pressed", "true");

      await userEvent.click(getToggle());
      await userEvent.click(document.body);

      expect(getBar()).toHaveAttribute("data-layout", "line");
      expect(getToggle()).toHaveAttribute("aria-pressed", "false");
    });

    it("goes back to one line and hides the toggle when the parentheses no longer nest", async () => {
      setup();
      await typeText("((");
      await userEvent.click(getToggle());

      await typeText("{Backspace}");

      expect(queryToggle()).not.toBeInTheDocument();
      expect(getBar()).toHaveAttribute("data-layout", "line");

      await typeText("(");
      expect(getToggle()).toHaveAttribute("aria-pressed", "false");
      expect(getBar()).toHaveAttribute("data-layout", "line");
    });

    it("turns the rows on with Shift+Enter, without picking the highlighted option", async () => {
      setup();
      await typeText("((total");

      await typeText("{Shift>}{Enter}{/Shift}");

      expect(getBar()).toHaveAttribute("data-layout", "rows");
      expect(getToggle()).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("textbox")).toHaveValue("total");
      expect(screen.queryByPlaceholderText("Operator")).not.toBeInTheDocument();

      await typeText("{Shift>}{Enter}{/Shift}");
      expect(getBar()).toHaveAttribute("data-layout", "rows");
    });

    it("ignores Shift+Enter without nested parentheses, but a plain Enter still picks the option", async () => {
      setup();
      await typeText("total");

      await typeText("{Shift>}{Enter}{/Shift}");

      expect(queryToggle()).not.toBeInTheDocument();
      expect(getBar()).toHaveAttribute("data-layout", "line");
      expect(screen.queryByPlaceholderText("Operator")).not.toBeInTheDocument();

      await typeText("{Enter}");
      expect(
        await screen.findByPlaceholderText("Operator"),
      ).toBeInTheDocument();
    });
  });

  describe("typing a space", () => {
    const setup = () => {
      fetchMock.get("path:/api/prototype/field-categories", []);
      fetchMock.get("path:/api/prototype/filter-usage", []);
      fetchMock.get("path:/api/prototype/samples", { tables: [], columns: [] });
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
      const onChange = jest.fn<void, [Lib.Query]>();
      renderWithProviders(
        <ExpressionBar
          query={query}
          stageIndex={0}
          isAutoApply
          onChange={onChange}
          openKey={0}
        />,
      );
      return { onChange };
    };
    const typeText = (text: string) =>
      userEvent.type(screen.getByRole("textbox"), text);
    const getOptions = () => within(screen.getByRole("listbox"));

    it("selects the column with the typed name, ignoring case", async () => {
      setup();
      await typeText("total ");
      expect(screen.getByRole("button", { name: "Total" })).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Operator")).toBeInTheDocument();
    });

    it("keeps searching when a column name continues the typed text", async () => {
      setup();
      await typeText("created ");
      expect(
        screen.queryByRole("button", { name: "Created At" }),
      ).not.toBeInTheDocument();
      expect(
        (await getOptions().findAllByText("Created At")).length,
      ).toBeGreaterThan(0);
    });

    it("selects the operator with the typed name, ignoring case", async () => {
      setup();
      await typeText("total ");
      await typeText("Not Equal To ");
      expect(screen.getByPlaceholderText("Number")).toBeInTheDocument();
    });

    it("keeps searching when an operator name continues the typed text", async () => {
      setup();
      await typeText("total ");
      await typeText("greater than ");
      expect(screen.getByPlaceholderText("Operator")).toBeInTheDocument();
      expect(
        await getOptions().findByText("greater than or equal to"),
      ).toBeInTheDocument();
    });

    it.each(["Tab", "Enter", " "])(
      "%s with a typed number applies the filter",
      async (key) => {
        const { onChange } = setup();
        await typeText("total ");
        await typeText(">= ");
        await typeText(`5{${key}}`);
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(
          screen.getByRole("button", { name: "Total" }),
        ).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "5" })).toBeInTheDocument();
      },
    );

    it("Tab or Space goes from the first number of a range to the second", async () => {
      const { onChange } = setup();
      await typeText("total ");
      await typeText("between ");
      await userEvent.type(screen.getAllByRole("textbox")[0], "5 ");
      expect(onChange).not.toHaveBeenCalled();
      await userEvent.keyboard("10{Tab}");
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: /5.*10/ })).toBeInTheDocument();
    });

    it("selects a number operator by its symbol", async () => {
      setup();
      await typeText("total ");
      await typeText(">= ");
      expect(screen.getByPlaceholderText("Number")).toBeInTheDocument();
    });
  });

  describe("typing parentheses", () => {
    const getQueryWithFilter = () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
      const column = columnFinder(query, Lib.filterableColumns(query, 0))(
        "ORDERS",
        "TOTAL",
      );
      return Lib.filter(
        query,
        0,
        toFilterClause(
          query,
          0,
          Lib.numberFilterClause({ operator: ">", column, values: [10] }),
        ),
      );
    };

    const AutoApplyBar = ({
      onChange,
    }: {
      onChange: (query: Lib.Query) => void;
    }) => {
      const [query, setQuery] = useState(getQueryWithFilter);
      return (
        <>
          <ExpressionBar
            query={query}
            stageIndex={0}
            isAutoApply
            onChange={(nextQuery) => {
              setQuery(nextQuery);
              onChange(nextQuery);
            }}
            openKey={0}
          />
          <button>Outside</button>
        </>
      );
    };

    const setup = () => {
      fetchMock.get("path:/api/prototype/field-categories", []);
      fetchMock.get("path:/api/prototype/filter-usage", []);
      fetchMock.get("path:/api/prototype/samples", { tables: [], columns: [] });
      const onChange = jest.fn<void, [Lib.Query]>();
      renderWithProviders(<AutoApplyBar onChange={onChange} />);
      return { onChange };
    };

    const typeKeys = (keys: string) =>
      userEvent.type(screen.getByRole("textbox"), keys);
    const findOption = (label: string) =>
      within(screen.getByRole("listbox")).findByText(label);
    const addFilter = async (columnName: string) => {
      await typeKeys(columnName);
      await userEvent.click(await findOption(columnName));
      await userEvent.click(await findOption(">"));
      await typeKeys("5{Enter}");
    };
    const getOpens = () =>
      screen.queryAllByRole("button", { name: "Remove (" });
    const getCloses = () =>
      screen.queryAllByRole("button", { name: "Remove )" });
    const getFilterOperators = (query: Lib.Query) =>
      Lib.filters(query, 0).map(
        (filter) => Lib.expressionParts(query, 0, filter).operator,
      );

    it("adds the closing parenthesis with the opening one", async () => {
      const { onChange } = setup();
      await typeKeys("(");
      expect(getOpens()).toHaveLength(1);
      expect(getCloses()).toHaveLength(1);
      expect(onChange).not.toHaveBeenCalled();
    });

    it("puts a filter between the parentheses, and they survive its apply", async () => {
      const { onChange } = setup();
      await typeKeys("(");
      await addFilter("Tax");
      expect(onChange).toHaveBeenCalled();
      expect(getOpens()).toHaveLength(1);
      expect(getCloses()).toHaveLength(1);

      await typeKeys("or{Enter}");
      await addFilter("Discount");

      expect(getFilterOperators(onChange.mock.lastCall![0])).toEqual([
        ">",
        "or",
      ]);
    });

    it("steps over the closing parenthesis, so the next filter goes after it", async () => {
      const { onChange } = setup();
      await typeKeys("(");
      await addFilter("Tax");
      await typeKeys("or{Enter}");
      await addFilter("Discount");
      await typeKeys(")");
      expect(getCloses()).toHaveLength(1);

      await addFilter("Quantity");

      expect(getCloses()).toHaveLength(1);
      expect(getFilterOperators(onChange.mock.lastCall![0])).toEqual([
        ">",
        "or",
        ">",
      ]);
    });

    it("removes an empty pair with Backspace", async () => {
      const { onChange } = setup();
      await typeKeys("(");
      await typeKeys("{Backspace}");
      expect(getOpens()).toHaveLength(0);
      expect(getCloses()).toHaveLength(0);
      expect(screen.getAllByTestId("filter-pill")).toHaveLength(1);
      expect(onChange).not.toHaveBeenCalled();
    });

    const typeOpenBeforeFilter = async () => {
      const bar = screen.getByTestId("filter-expression-bar");
      // eslint-disable-next-line testing-library/no-node-access -- the caret slots have no role or text
      await userEvent.click(bar.querySelectorAll("[data-caret-slot]")[0]);
      await typeKeys("(");
    };

    it("does not close a group that wraps the filter after the caret", async () => {
      setup();
      await typeOpenBeforeFilter();
      expect(getOpens()).toHaveLength(1);
      expect(getCloses()).toHaveLength(0);
    });

    it("adds a missing closing parenthesis on Enter instead of an error", async () => {
      setup();
      await typeOpenBeforeFilter();
      await typeKeys("{Enter}");
      expect(
        screen.queryByText("Missing closing parenthesis"),
      ).not.toBeInTheDocument();
      expect(getOpens()).toHaveLength(0);
      expect(screen.getAllByTestId("filter-pill")).toHaveLength(1);
    });

    it("adds a missing closing parenthesis on leaving", async () => {
      setup();
      await typeOpenBeforeFilter();
      await userEvent.click(screen.getByRole("button", { name: "Outside" }));
      expect(getOpens()).toHaveLength(0);
      expect(screen.getAllByTestId("filter-pill")).toHaveLength(1);
    });

    it("drops parentheses that the query does not need on leaving", async () => {
      setup();
      await typeKeys("(");
      await addFilter("Tax");
      await userEvent.click(screen.getByRole("button", { name: "Outside" }));
      expect(getOpens()).toHaveLength(0);
      expect(getCloses()).toHaveLength(0);
      expect(screen.getAllByTestId("filter-pill")).toHaveLength(2);
    });
  });

  describe("typing AND", () => {
    const getQueryWithTwoFilters = () => {
      const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
      const column = columnFinder(query, Lib.filterableColumns(query, 0))(
        "ORDERS",
        "TOTAL",
      );
      return [10, 20].reduce(
        (filteredQuery, value) =>
          Lib.filter(
            filteredQuery,
            0,
            toFilterClause(
              filteredQuery,
              0,
              Lib.numberFilterClause({
                operator: ">",
                column,
                values: [value],
              }),
            ),
          ),
        query,
      );
    };

    const AutoApplyBar = ({
      onChange,
    }: {
      onChange: (query: Lib.Query) => void;
    }) => {
      const [query, setQuery] = useState(getQueryWithTwoFilters);
      return (
        <>
          <ExpressionBar
            query={query}
            stageIndex={0}
            isAutoApply
            onChange={(nextQuery) => {
              setQuery(nextQuery);
              onChange(nextQuery);
            }}
            openKey={0}
          />
          <button>Outside</button>
        </>
      );
    };

    const setup = () => {
      fetchMock.get("path:/api/prototype/field-categories", []);
      fetchMock.get("path:/api/prototype/filter-usage", []);
      fetchMock.get("path:/api/prototype/samples", { tables: [], columns: [] });
      const onChange = jest.fn<void, [Lib.Query]>();
      renderWithProviders(<AutoApplyBar onChange={onChange} />);
      return { onChange };
    };

    const findOption = (label: string) =>
      within(screen.getByRole("listbox")).findByText(label);
    const getAnds = () =>
      screen.queryAllByRole("button", { name: "Remove AND" });
    const getOrs = () => screen.queryAllByRole("button", { name: "Remove OR" });
    const addTaxFilter = async () => {
      await userEvent.type(screen.getByRole("textbox"), "Tax");
      await userEvent.click(await findOption("Tax"));
      await userEvent.click(await findOption(">"));
      await userEvent.type(screen.getByRole("textbox"), "5{Enter}");
    };
    const typeLogic = (keyword: string) =>
      userEvent.type(screen.getByRole("textbox"), `${keyword}{Enter}`);
    const leaveBar = () =>
      userEvent.click(screen.getByRole("button", { name: "Outside" }));

    it("keeps ANDs hidden until one is typed", () => {
      setup();
      expect(screen.getAllByTestId("filter-pill")).toHaveLength(2);
      expect(getAnds()).toHaveLength(0);
    });

    it("shows every AND once one is typed, also after the next filter", async () => {
      setup();
      await typeLogic("and");
      expect(getAnds()).toHaveLength(2);

      await addTaxFilter();

      expect(screen.getAllByTestId("filter-pill")).toHaveLength(3);
      expect(getAnds()).toHaveLength(2);
    });

    it("leaves the other ANDs alone while ANDs are being removed", async () => {
      setup();
      await typeLogic("and");
      await addTaxFilter();

      await userEvent.click(getAnds()[0]);
      expect(getAnds()).toHaveLength(1);

      await userEvent.click(getAnds()[0]);
      expect(getAnds()).toHaveLength(0);
    });

    it("fills the gaps, drops a dangling connector and hides the ANDs on leaving", async () => {
      const { onChange } = setup();
      await typeLogic("and");
      await addTaxFilter();
      await userEvent.click(getAnds()[0]);

      const bar = screen.getByTestId("filter-expression-bar");
      // eslint-disable-next-line testing-library/no-node-access -- the caret slots have no role or text
      const slots = bar.querySelectorAll("[data-caret-slot]");
      await userEvent.click(slots[slots.length - 1]);
      await typeLogic("or");
      expect(getOrs()).toHaveLength(1);

      await leaveBar();

      expect(screen.getAllByTestId("filter-pill")).toHaveLength(3);
      expect(getOrs()).toHaveLength(0);
      expect(getAnds()).toHaveLength(0);
      expect(Lib.filters(onChange.mock.lastCall![0], 0)).toHaveLength(3);
    });

    it("shows every AND after leaving when an OR is left", async () => {
      setup();
      await typeLogic("or");
      await addTaxFilter();
      expect(getAnds()).toHaveLength(1);

      await leaveBar();

      expect(getAnds()).toHaveLength(1);
      expect(getOrs()).toHaveLength(1);
    });

    it("hides a typed AND on leaving when no OR is left", async () => {
      setup();
      await typeLogic("and");
      await addTaxFilter();
      expect(getAnds()).toHaveLength(2);

      await leaveBar();

      expect(screen.getAllByTestId("filter-pill")).toHaveLength(3);
      expect(getAnds()).toHaveLength(0);
    });
  });
});
