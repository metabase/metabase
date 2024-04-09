import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";

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
    expect(screen.getByTestId("date-picker")).toBeInTheDocument();
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
    const specificDatePicker = screen.getByTestId("specific-date-picker");
    expect(specificDatePicker).toBeInTheDocument();

    expect(
      within(screen.getByTestId("specific-date-picker")).getByRole("textbox"),
    ).toHaveValue("09/20/2023");
  });

  it("should populate the `Relative dates…` date picker with the value passed in", () => {
    setup({ value: "past30days" });
    expect(screen.getByTestId("relative-datetime-value")).toHaveValue("30");
    expect(screen.getByTestId("select-button-content")).toHaveTextContent(
      "days",
    );
  });
});
