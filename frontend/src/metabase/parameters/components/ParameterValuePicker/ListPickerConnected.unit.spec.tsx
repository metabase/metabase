/* eslint-disable jest/no-conditional-expect */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Parameter } from "metabase-types/api";
import {
  createMockParameter,
  // createMockParameterValues,
} from "metabase-types/api/mocks";

import { ListPickerConnected } from "./ListPickerConnected";

// createMockParameterValues

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

function setup({
  value,
  parameter,
  forceSearchItemCount = 50,
}: {
  value: string | null;
  parameter: Parameter;
  forceSearchItemCount?: number;
}) {
  const onChangeMock = jest.fn();
  const fetchValuesMock = jest.fn();

  const { rerender, unmount } = render(
    <ListPickerConnected
      value={value}
      parameter={parameter}
      onChange={onChangeMock}
      fetchValues={fetchValuesMock}
      forceSearchItemCount={forceSearchItemCount}
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

    it("with values", () => {
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
      userEvent.click(screen.getByText("1 Joseph Drive"));

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

      userEvent.click(screen.getByPlaceholderText("Select a default value…"));
      userEvent.click(screen.getByText("1-7 County Road 462"));

      expect(onChangeMock).toHaveBeenCalledTimes(1);
      expect(onChangeMock).toHaveBeenCalledWith("1-7 County Road 462");
    });

    it("resets and keeps working when re-rendering with another parameter", () => {
      const render1 = setup({
        value: null,
        parameter: getStaticListParam(),
      });

      userEvent.click(screen.getByPlaceholderText("Select a default value…"));
      userEvent.click(screen.getByText("1-7 County Road 462"));
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

      userEvent.click(screen.getByPlaceholderText("Select a default value…"));
      OTHER_VALUES.forEach(value => {
        expect(screen.getByText(value)).toBeVisible();
      });
      userEvent.click(screen.getByText("AL"));
      userEvent.click(screen.getByPlaceholderText("Select a default value…"));
      userEvent.click(screen.getByText("CA"));
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
  });

  describe("parameters coming from card", () => {
    it.todo("shows loader");
  });
});
