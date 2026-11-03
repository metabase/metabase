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
import { toFilterClause } from "./tokens";

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
