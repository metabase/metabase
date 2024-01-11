import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BetweenPicker } from "./RangeDatePicker";

interface TestBetweenPickerProps {
  initialFilter: any[];
}

const TestBetweenPicker = ({ initialFilter }: TestBetweenPickerProps) => {
  const [filter, setFilter] = useState(initialFilter);
  return <BetweenPicker filter={filter} onFilterChange={setFilter} />;
};

describe("BetweenPicker", () => {
  const field = ["field", 10, null];

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2022-05-01 08:00:00"));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("should change the filter by calendar", () => {
    const initialFilter = ["between", field, "2022-08-10", "2022-08-29"];

    render(<TestBetweenPicker initialFilter={initialFilter} />);
    userEvent.click(screen.getByText("12"));
    userEvent.click(screen.getByText("20"));

    expect(screen.getByDisplayValue("08/12/2022")).toBeInTheDocument();
    expect(screen.getByDisplayValue("08/20/2022")).toBeInTheDocument();
  });

  it("should change the filter by keyboard and calendar", () => {
    const initialFilter = ["between", field, "2022-08-10", "2022-08-29"];

    render(<TestBetweenPicker initialFilter={initialFilter} />);

    const startDateInput = screen.getByDisplayValue("08/10/2022");
    userEvent.clear(startDateInput);
    userEvent.type(startDateInput, "07/25/2022");
    userEvent.tab();

    const endDateInput = screen.getByDisplayValue("08/29/2022");
    userEvent.click(screen.getByText("20"));

    expect(startDateInput).toHaveValue("07/25/2022");
    expect(endDateInput).toHaveValue("08/20/2022");
  });
});
