import { screen } from "@testing-library/react";
import { t } from "ttag";

import { renderWithProviders } from "__support__/ui";
import { createMockParameter } from "metabase-types/api/mocks";

import DefaultParametersSection from "./DefaultParametersSection";

// Mock the date formatting utility
jest.mock("metabase/parameters/utils/date-formatting", () => ({
  formatDateValue: jest.fn((parameter, value) => {
    if (parameter.type === "date/relative" && value === "past30days") {
      return "Previous 30 Days";
    }
    if (parameter.type === "date/single" && value === "2024-01-15") {
      return "January 15, 2024";
    }
    // Basic fallback for other date types/values in tests
    return `Formatted: ${value}`;
  }),
}));

describe("DefaultParametersSection", () => {
  const setup = (parameters) => {
    renderWithProviders(<DefaultParametersSection parameters={parameters} />);
  };

  it("should render the heading and info text", () => {
    setup([]);
    expect(screen.getByText("Filter values")).toBeInTheDocument();
    expect(
      screen.getByText(
        "If a dashboard filter has a default value, it'll be applied when your subscription is sent.",
      ),
    ).toBeInTheDocument();
    // Check for info icon tooltip text
    expect(screen.getByRole("img", { name: /info icon/i })).toBeInTheDocument();
  });

  it("should render a simple text parameter with a default value", () => {
    const parameters = [
      createMockParameter({
        name: "State",
        type: "location/state",
        default: "CA",
      }),
    ];
    setup(parameters);
    expect(screen.getByText("State is CA")).toBeInTheDocument();
  });

  it("should render a parameter with multiple default text values", () => {
    const parameters = [
      createMockParameter({
        name: "Source",
        type: "string/=",
        default: ["Organic", "Direct"],
      }),
    ];
    setup(parameters);
    expect(
      screen.getByText(t`Source is ${"Organic"} and ${"Direct"}`),
    ).toBeInTheDocument();
  });

  it("should render a date/single parameter using formatDateValue", () => {
    const parameters = [
      createMockParameter({
        name: "Created At",
        type: "date/single",
        default: "2024-01-15",
      }),
    ];
    setup(parameters);
    expect(
      screen.getByText("Created At is January 15, 2024"),
    ).toBeInTheDocument();
  });

  it("should render a date/relative parameter using formatDateValue", () => {
    const parameters = [
      createMockParameter({
        name: "Date Range",
        type: "date/relative",
        default: "past30days",
      }),
    ];
    setup(parameters);
    expect(
      screen.getByText("Date Range is Previous 30 Days"),
    ).toBeInTheDocument();
  });

  it("should render multiple parameters correctly", () => {
    const parameters = [
      createMockParameter({
        name: "State",
        type: "location/state",
        default: "NY",
      }),
      createMockParameter({
        name: "Timeframe",
        type: "date/relative",
        default: "past30days",
      }),
      createMockParameter({ name: "Category", type: "category" }), // No default
    ];
    setup(parameters);
    expect(screen.getByText("State is NY")).toBeInTheDocument();
    expect(
      screen.getByText("Timeframe is Previous 30 Days"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Category is/)).not.toBeInTheDocument();
  });
});
