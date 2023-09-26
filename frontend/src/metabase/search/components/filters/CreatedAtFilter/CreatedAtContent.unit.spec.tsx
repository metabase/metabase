import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import { CreatedAtContent } from "./CreatedAtContent";

const setup = (value, onChange) => {
  renderWithProviders(<CreatedAtContent value={value} onChange={onChange} />);
};

describe("CreatedAtContent", () => {
  it("should render CreatedAtContent component", () => {
    setup("2023-09-18", jest.fn());
    const createdAtContent = screen.getByTestId("created-at-content");
    expect(createdAtContent).toBeInTheDocument();
  });

  it("should call onChange when value is changed", () => {
    const onChangeMock = jest.fn();
    setup("2023-09-18", onChangeMock);

    // Simulate a change in value using userEvent
    const inputElement = screen.getByTestId("created-at-content-input");
    userEvent.clear(inputElement);
    userEvent.type(inputElement, "2023-09-19");

    expect(onChangeMock).toHaveBeenCalledTimes(1);
    expect(onChangeMock).toHaveBeenCalledWith("2023-09-19");
  });

  it("should set value to undefined when null is passed", () => {
    const onChangeMock = jest.fn();
    setup(null, onChangeMock);

    // Simulate a change in value using userEvent
    const inputElement = screen.getByTestId("created-at-content-input");
    userEvent.clear(inputElement);
    userEvent.type(inputElement, "2023-09-19");

    expect(onChangeMock).toHaveBeenCalledTimes(1);
    expect(onChangeMock).toHaveBeenCalledWith(undefined);
  });
});
