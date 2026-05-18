import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "__support__/ui";
import type * as Lib from "metabase-lib";

import { TimeControlBar } from "./TimeControlBar";

describe("TimeControlBar", () => {
  it("opens the date picker when the time range button is clicked", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <TimeControlBar
        timeRange={{
          label: "Last 30 days",
          value: undefined,
          availableUnits: [],
          hasActiveFilter: false,
          onChange: () => {},
          onClear: () => {},
        }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Last 30 days" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Last 30 days" }));

    expect(screen.getByTestId("date-picker-type-specific")).toBeInTheDocument();
  });

  it("opens granularity dropdown and calls onChange when an item is selected", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const mockBucket = {} as Lib.Bucket;

    renderWithProviders(
      <TimeControlBar
        timeGranularity={{
          label: "by month",
          currentUnit: "month",
          availableItems: [
            { bucket: mockBucket, unit: "month", label: "Month" },
            { bucket: mockBucket, unit: "year", label: "Year" },
          ],
          onChange,
        }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "by month" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "by month" }));

    expect(screen.getByRole("option", { name: "Month" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Year" })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "Year" }));

    expect(onChange).toHaveBeenCalledWith(mockBucket);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("renders only time controls", () => {
    renderWithProviders(
      <TimeControlBar
        timeRange={{
          label: "2024 only",
          value: undefined,
          availableUnits: [],
          hasActiveFilter: true,
          onChange: jest.fn(),
          onClear: jest.fn(),
        }}
      />,
    );

    expect(screen.getByTestId("query-explorer-bar")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "2024 only" }),
    ).toBeInTheDocument();
  });
});
