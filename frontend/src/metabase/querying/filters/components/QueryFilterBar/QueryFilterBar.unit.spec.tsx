import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { focusBar, getPillTexts, typeText } from "__support__/filter-bar";
import { act, renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";

import {
  createQuery,
  createQueryWithNumberFilter,
  createSummarizedQuery,
  storeInitialState,
} from "../FilterPicker/test-utils";

import { QueryFilterBar } from "./QueryFilterBar";

type SetupOpts = {
  query?: Lib.Query;
};

const setup = async ({ query = createQuery() }: SetupOpts = {}) => {
  const onChange = jest.fn<void, [Lib.Query]>();

  const Wrapper = () => {
    const [currentQuery, setCurrentQuery] = useState(query);
    const handleChange = (newQuery: Lib.Query) => {
      setCurrentQuery(newQuery);
      onChange(newQuery);
    };
    return <QueryFilterBar query={currentQuery} onChange={handleChange} />;
  };

  renderWithProviders(<Wrapper />, { storeInitialState });
  await act(() => Promise.resolve());

  const getNewQuery = () => checkNotNull(onChange.mock.lastCall)[0];

  return { getNewQuery, onChange };
};

const getFilterNames = (query: Lib.Query, stageIndex: number) =>
  Lib.filters(query, stageIndex).map(
    (filter) => Lib.displayInfo(query, stageIndex, filter).displayName,
  );

describe("QueryFilterBar", () => {
  it("shows the filters of the query as pills", async () => {
    const { query } = createQueryWithNumberFilter({
      operator: ">",
      values: [5],
    });
    await setup({ query });

    expect(getPillTexts()).toEqual(["Total>5"]);
  });

  it("adds a filter typed by column, operator and value", async () => {
    const { getNewQuery } = await setup();
    await focusBar();

    await typeText("tax");
    await userEvent.keyboard("{Enter}");
    await typeText("greater than");
    await userEvent.keyboard("{Enter}");
    await typeText("5");
    await userEvent.keyboard("{Enter}");

    expect(getFilterNames(getNewQuery(), 0)).toEqual(["Tax is greater than 5"]);
  });

  it("does not add a number filter with a text value", async () => {
    const { onChange } = await setup();
    await focusBar();

    await typeText("tax");
    await userEvent.keyboard("{Enter}");
    await typeText("greater than");
    await userEvent.keyboard("{Enter}");
    await typeText("abc");
    await userEvent.keyboard("{Enter}");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("puts a filter on a summary into the next stage", async () => {
    const { getNewQuery } = await setup({ query: createSummarizedQuery() });
    await focusBar();

    await typeText("count");
    await userEvent.click(screen.getByRole("option", { name: /Count$/ }));
    await typeText("greater than");
    await userEvent.keyboard("{Enter}");
    await typeText("5");
    await userEvent.keyboard("{Enter}");

    expect(getFilterNames(getNewQuery(), 1)).toEqual([
      "Count is greater than 5",
    ]);
  });
});
