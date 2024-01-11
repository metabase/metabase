import { fireEvent, render, screen } from "@testing-library/react";
import { DateExcludeWidget } from "./DateExcludeWidget";

describe("DateExcludeWidget", () => {
  it("renders exclude options", () => {
    render(
      <DateExcludeWidget
        value={null}
        setValue={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText("Days of the week...")).toBeVisible();
    expect(screen.getByText("Months of the year...")).toBeVisible();
    expect(screen.getByText("Quarters of the year...")).toBeVisible();
    expect(screen.getByText("Hours of the day...")).toBeVisible();
  });

  it("excludes days", () => {
    const setValue = jest.fn();
    const onClose = jest.fn();

    render(
      <DateExcludeWidget
        value="exclude-days-Mon"
        setValue={setValue}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByLabelText("Friday"));
    fireEvent.click(screen.getByText("Update filter"));

    expect(setValue).toHaveBeenCalledWith("exclude-days-Mon-Fri");
    expect(onClose).toHaveBeenCalled();
  });

  it("excludes months", () => {
    const setValue = jest.fn();
    const onClose = jest.fn();

    render(
      <DateExcludeWidget
        value="exclude-months-Jan"
        setValue={setValue}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByLabelText("July"));
    fireEvent.click(screen.getByText("Update filter"));

    expect(setValue).toHaveBeenCalledWith("exclude-months-Jan-Jul");
    expect(onClose).toHaveBeenCalled();
  });
});
