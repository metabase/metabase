import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DriverDeprecationBanner from "./DriverDeprecationBanner";

describe("DriverDeprecationBanner", () => {
  const database = { id: 1 };

  it("should not render if not enabled", () => {
    render(<DriverDeprecationBanner database={database} isEnabled={false} />);

    expect(screen.queryByText("Show me")).not.toBeInTheDocument();
  });

  it("should no render if there is no deprecated database", () => {
    render(<DriverDeprecationBanner isEnabled={true} />);

    expect(screen.queryByText("Show me")).not.toBeInTheDocument();
  });

  it("should render a warning with a link to the database", () => {
    render(<DriverDeprecationBanner database={database} isEnabled={true} />);

    expect(screen.getByText("Show me")).toBeInTheDocument();
  });

  it("should close on click on the close icon", () => {
    const onClose = jest.fn();

    render(
      <DriverDeprecationBanner
        database={database}
        isEnabled={true}
        onClose={onClose}
      />,
    );

    userEvent.click(screen.getByLabelText("close icon"));
    expect(onClose).toHaveBeenCalled();
  });
});
