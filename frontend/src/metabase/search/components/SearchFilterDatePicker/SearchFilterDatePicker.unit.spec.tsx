import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { SearchFilterDatePicker } from "./SearchFilterDatePicker";

type SetupProps = {
  value?: string | null;
};

const setup = ({ value = null }: SetupProps = {}) => {
  const onChangeMock = jest.fn();
  renderWithProviders(
    <SearchFilterDatePicker value={value} onChange={onChangeMock} />,
  );
  return {
    onChangeMock,
  };
};

describe("SearchFilterDatePicker", () => {
  it("should render SearchFilterDatePicker component", () => {
    setup();
    expect(screen.getByText("Specific dates…")).toBeInTheDocument();
  });

  it("should not display Exclude… in the date picker shortcut options", () => {
    setup();
    expect(screen.queryByText("Exclude…")).not.toBeInTheDocument();
  });

  it("should call onChange when a date is selected", async () => {
    const { onChangeMock } = setup();
    await userEvent.click(screen.getByText("Today"));
    expect(onChangeMock).toHaveBeenCalled();
  });

  it("should populate the `Specific dates…` date picker with the value passed in", () => {
    setup({ value: "2023-09-20" });
    expect(screen.getByLabelText("Date")).toHaveValue("September 20, 2023");
  });

  it("should populate the `Relative dates…` date picker with the value passed in", () => {
    setup({ value: "past30days" });
    expect(screen.getByLabelText("Interval")).toHaveValue("30");
    expect(screen.getByLabelText("Unit")).toHaveValue("days");
  });
});
