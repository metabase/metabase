import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Filter from "metabase-lib/v1/queries/structured/Filter";

import { PastPicker, NextPicker } from "./RelativeDatePicker";

describe("PastPicker", () => {
  it("should change a filter", async () => {
    const filter = new Filter(["time-interval", null, -10, "month"]);
    const onFilterChange = jest.fn();

    render(<PastPicker filter={filter} onFilterChange={onFilterChange} />);
    await typeByDisplayValue("10", "20");

    const expectedFilter = ["time-interval", null, -20, "month"];
    expect(onFilterChange).toHaveBeenCalledWith(expectedFilter);
  });

  it("should not allow to enter an empty time interval", async () => {
    const filter = new Filter(["time-interval", null, -10, "month"]);
    const onFilterChange = jest.fn();

    render(<PastPicker filter={filter} onFilterChange={onFilterChange} />);
    await typeByDisplayValue("10", "0");

    expect(onFilterChange).toHaveBeenCalledWith(filter);
  });
});

describe("NextPicker", () => {
  it("should change a filter", async () => {
    const filter = new Filter(["time-interval", null, 10, "month"]);
    const onFilterChange = jest.fn();

    render(<NextPicker filter={filter} onFilterChange={onFilterChange} />);
    await typeByDisplayValue("10", "20");

    const expectedFilter = ["time-interval", null, 20, "month"];
    expect(onFilterChange).toHaveBeenCalledWith(expectedFilter);
  });

  it("should not allow to enter an empty time interval", async () => {
    const filter = new Filter(["time-interval", null, 10, "month"]);
    const onFilterChange = jest.fn();

    render(<NextPicker filter={filter} onFilterChange={onFilterChange} />);
    await typeByDisplayValue("10", "0");

    expect(onFilterChange).toHaveBeenCalledWith(filter);
  });
});

const typeByDisplayValue = async (label: string, value: string) => {
  const input = screen.getByDisplayValue(label);
  await userEvent.clear(input);
  await userEvent.type(input, value);
  await userEvent.tab();
};
