/* eslint-disable jest/no-conditional-expect */
/* eslint-disable testing-library/no-unnecessary-act */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Parameter } from "metabase-types/api";
import {
  createMockParameter,
  createMockParameterValues,
} from "metabase-types/api/mocks";

import { ListPickerConnected } from "./ListPickerConnected";

// If some state updates aren't happening inside the component,
// the test will fail on a relatively short timeout
jest.setTimeout(1000);

const STATIC_VALUES = [
  "1 A Point Pleasant Road",
  "1 Appaloosa Court",
  "1 Benson Creek Drive",
  "1 Fox Lane",
  "1 Joseph Drive",
  "1 Old Garrard Road",
  "1 Rabbit Island",
  "1 Spring Brook Lane",
  "1 Uinaq Road",
  "1 Whitams Island",
  "1-1245 Lee Road 146",
  "1-5 Texas 41",
  "1-661 Poverty Lane",
  "1-7 County Road 462",
  "1-799 Smith Road",
];

const OTHER_VALUES = ["AK", "AL", "AR", "AZ", "CA"];

function getStaticListParam(values = STATIC_VALUES, queryType = "list") {
  return createMockParameter({
    id: "param",
    type: "category",
    target: ["variable", ["template-tag", "address"]],
    name: "Address",
    slug: "address",
    default: null,
    required: false,
    values_query_type: queryType as any,
    values_source_type: "static-list",
    values_source_config: {
      values: values.slice(),
    },
    value: null,
  });
}

function getEmptyParam(value: any) {
  return createMockParameter({
    id: "param",
    type: "category",
    target: ["variable", ["template-tag", "address"]],
    name: "Address",
    slug: "address",
    default: value,
    required: false,
    values_query_type: "search",
    values_source_type: "static-list",
    values_source_config: value,
    value,
  });
}

function getAnotherStaticListParam() {
  return createMockParameter({
    id: "another-param",
    type: "category",
    target: ["variable", ["template-tag", "state"]],
    name: "State",
    slug: "state",
    default: null,
    required: false,
    values_query_type: "list",
    values_source_type: "static-list",
    values_source_config: {
      values: OTHER_VALUES,
    },
    value: null,
  });
}

function getCardBoundParam() {
  return createMockParameter({
    id: "card-param",
    type: "category",
    target: ["variable", ["template-tag", "state"]],
    name: "State",
    slug: "state",
    default: null,
    required: false,
    values_query_type: "list",
    values_source_type: "card",
    values_source_config: {
      card_id: 5776,
      value_field: ["field", "STATE", { "base-type": "type/Text" }],
    },
  });
}

function getResolvedValuesMock(
  values: any[],
  { hasMore = false }: { hasMore?: boolean } = {},
) {
  return jest.fn(() =>
    Promise.resolve(
      createMockParameterValues({
        values,
        has_more_values: hasMore,
      }),
    ),
  );
}

function setup({
  value,
  parameter,
  forceSearchItemCount = 50,
  fetchValuesMock = jest.fn(),
}: {
  value: string | null;
  parameter: Parameter;
  forceSearchItemCount?: number;
  fetchValuesMock?: () => any;
}) {
  const onChangeMock = jest.fn();

  const { rerender, unmount } = render(
    <ListPickerConnected
      value={value}
      parameter={parameter}
      onChange={onChangeMock}
      fetchValues={fetchValuesMock}
      forceSearchItemCount={forceSearchItemCount}
      searchDebounceMs={150}
    />,
  );

  return {
    onChangeMock,
    fetchValuesMock,
    rerender: (newValue: string | null, newParam: Parameter) => {
      rerender(
        <ListPickerConnected
          value={newValue}
          parameter={newParam}
          onChange={onChangeMock}
          fetchValues={fetchValuesMock}
          forceSearchItemCount={forceSearchItemCount}
        />,
      );
    },
    unmount,
  };
}

describe("ListPickerConnected", () => {
  describe("static value list", () => {
    it("without values", () => {
      const { onChangeMock, fetchValuesMock } = setup({
        value: null,
        parameter: getStaticListParam([]),
      });

      userEvent.click(screen.getByPlaceholderText("Select a default value…"));
      expect(screen.getByText("No matching result")).toBeVisible();

      expect(onChangeMock).toHaveBeenCalledTimes(0);
      expect(fetchValuesMock).toHaveBeenCalledTimes(0);
    });

    it("with values", async () => {
      const { onChangeMock, fetchValuesMock } = setup({
        value: "1-5 Texas 41",
        parameter: getStaticListParam(),
      });

      const input = screen
        .getAllByDisplayValue("1-5 Texas 41")
        .filter(el => el.getAttribute("type") !== "hidden")[0];

      userEvent.click(input);
      STATIC_VALUES.forEach(value =>
        expect(screen.getByText(value)).toBeVisible(),
      );

      act(() => userEvent.click(screen.getByText("1 Joseph Drive")));

      expect(onChangeMock).toHaveBeenCalledTimes(1);
      expect(onChangeMock).toHaveBeenCalledWith("1 Joseph Drive");
      expect(fetchValuesMock).toHaveBeenCalledTimes(0);
    });

    it("filters on search", () => {
      setup({
        value: null,
        parameter: getStaticListParam(STATIC_VALUES, "search"),
      });

      const select = screen.getByPlaceholderText("Start typing to filter…");

      userEvent.click(select);
      userEvent.type(select, "Road");

      STATIC_VALUES.forEach(value => {
        const listItem = screen.queryByText(value);

        value.indexOf("Road") !== -1
          ? expect(listItem).toBeVisible()
          : expect(listItem).not.toBeInTheDocument();
      });
    });

    it("clears value when clicked on close", () => {
      const { onChangeMock } = setup({
        value: "1-1245 Lee Road 146",
        parameter: getStaticListParam(),
      });

      userEvent.click(screen.getByLabelText("close icon"));
      expect(onChangeMock).toHaveBeenCalledTimes(1);
      expect(onChangeMock).toHaveBeenCalledWith(null);
      onChangeMock.mockReset();

      act(() =>
        userEvent.click(screen.getByPlaceholderText("Select a default value…")),
      );
      act(() => userEvent.click(screen.getByText("1-7 County Road 462")));

      expect(onChangeMock).toHaveBeenCalledTimes(1);
      expect(onChangeMock).toHaveBeenCalledWith("1-7 County Road 462");
    });

    it("resets and keeps working when re-rendering with another parameter", () => {
      const render1 = setup({
        value: null,
        parameter: getStaticListParam(),
      });

      act(() =>
        userEvent.click(screen.getByPlaceholderText("Select a default value…")),
      );
      act(() => userEvent.click(screen.getByText("1-7 County Road 462")));

      render1.onChangeMock.mockReset();

      render1.rerender(null, getAnotherStaticListParam());
      expect(render1.onChangeMock).toHaveBeenCalledTimes(1);
      expect(render1.onChangeMock).toHaveBeenCalledWith(null);

      userEvent.click(screen.getByPlaceholderText("Select a default value…"));
      OTHER_VALUES.forEach(value => {
        expect(screen.getByText(value)).toBeVisible();
      });

      render1.unmount();

      const render2 = setup({
        value: null,
        parameter: getAnotherStaticListParam(),
      });

      act(() =>
        userEvent.click(screen.getByPlaceholderText("Select a default value…")),
      );
      OTHER_VALUES.forEach(value => {
        expect(screen.getByText(value)).toBeVisible();
      });
      act(() => userEvent.click(screen.getByText("AL")));

      act(() =>
        userEvent.click(screen.getByPlaceholderText("Select a default value…")),
      );
      act(() => userEvent.click(screen.getByText("CA")));
      expect(render2.onChangeMock).toHaveBeenCalledTimes(2);
      expect(render2.onChangeMock).toHaveBeenCalledWith("AL");
      expect(render2.onChangeMock).toHaveBeenCalledWith("CA");
      render2.onChangeMock.mockReset();

      render2.rerender(null, getAnotherStaticListParam());
      expect(render2.onChangeMock).toHaveBeenCalledTimes(0);

      userEvent.click(screen.getByPlaceholderText("Select a default value…"));
      OTHER_VALUES.forEach(value => {
        expect(screen.getByText(value)).toBeVisible();
      });
    });

    // This probably shouldn't be supported but so far, it could happen
    it("renders with null/undefined values", () => {
      [null, undefined].forEach(value => {
        expect(() => {
          const { unmount } = setup({
            value: value as any,
            parameter: getEmptyParam(value),
          });

          userEvent.click(
            screen.getByPlaceholderText("Start typing to filter…"),
          );
          unmount();
        }).not.toThrow();
      });
    });
  });

  describe("parameters coming from card", () => {
    it("shows loader before values are fetched", () => {
      setup({
        value: null,
        parameter: getCardBoundParam(),
        fetchValuesMock: jest.fn(() => new Promise(() => {})),
      });
      const input = screen.getByPlaceholderText("Start typing to filter…");
      userEvent.click(input);
      expect(screen.getByTestId("listpicker-loader")).toBeVisible();
    });

    it("fetches data on type and filters on it", async () => {
      const fetchValuesMock = getResolvedValuesMock([["CA"], ["AL"]], {
        hasMore: true,
      });
      const { onChangeMock } = setup({
        value: null,
        parameter: getCardBoundParam(),
        fetchValuesMock,
      });

      const input = screen.getByPlaceholderText("Start typing to filter…");
      expect(input).toBeVisible();
      userEvent.click(input);
      fetchValuesMock.mockReset();

      userEvent.type(input, "CA");
      await checkFetch(fetchValuesMock, 1, "CA");
      await clickCheckChange(onChangeMock, 1, "CA");

      userEvent.clear(input);
      userEvent.type(input, "AL");
      await checkFetch(fetchValuesMock, 2, "AL");
      await clickCheckChange(onChangeMock, 2, "AL");

      userEvent.clear(input);
      userEvent.type(input, "WA");
      await checkFetch(fetchValuesMock, 3, "No matching result");
    });

    it("does not call fetch multiple times", async () => {
      const fetchValuesMock = getResolvedValuesMock([["WA"], ["NY"]]);
      setup({
        value: null,
        parameter: getCardBoundParam(),
        fetchValuesMock,
      });

      const input = screen.getByPlaceholderText("Start typing to filter…");
      expect(input).toBeVisible();
      userEvent.click(input);
      fetchValuesMock.mockReset();

      userEvent.type(input, "WA");
      await checkFetch(fetchValuesMock, 1, "WA");

      userEvent.clear(input);
      userEvent.type(input, "NY");
      await checkFetch(fetchValuesMock, 2, "NY");
    });

    it("debounces fetch calls", async () => {
      const fetchValuesMock = getResolvedValuesMock(
        [["WA"], ["NY"], ["CA"], ["NC"]],
        { hasMore: true },
      );
      setup({
        value: null,
        parameter: getCardBoundParam(),
        fetchValuesMock,
      });

      const input = screen.getByPlaceholderText("Start typing to filter…");
      expect(input).toBeVisible();
      userEvent.click(input);

      await checkFetch(fetchValuesMock, 1, "WA");

      userEvent.type(input, "WA");
      userEvent.clear(input);
      userEvent.type(input, "CA");
      userEvent.clear(input);
      userEvent.type(input, "NC");

      await checkFetch(fetchValuesMock, 2, "NC");
    });

    it("shows fetch error", async () => {
      const fetchValuesMock = jest.fn(() => Promise.reject());
      setup({
        value: null,
        parameter: getCardBoundParam(),
        fetchValuesMock,
      });

      const input = screen.getByPlaceholderText("Start typing to filter…");
      userEvent.click(input);

      await waitFor(() =>
        expect(
          screen.getByText("Loading values failed. Please try again shortly."),
        ).toBeVisible(),
      );
    });
  });
});

async function checkFetch(mock: () => any, calls: number, value: string) {
  await waitFor(() => expect(screen.getByText(value)).toBeVisible());
  await waitFor(() =>
    expect(screen.queryByTestId("listpicker-loader")).not.toBeInTheDocument(),
  );
  await waitFor(() => expect(mock).toHaveBeenCalledTimes(calls));
}

async function clickCheckChange(mock: () => any, calls: number, value: string) {
  act(() => userEvent.click(screen.getByText(value)));
  await waitFor(() => expect(mock).toHaveBeenCalledWith(value));
  await waitFor(() => expect(mock).toHaveBeenCalledTimes(calls));
}
