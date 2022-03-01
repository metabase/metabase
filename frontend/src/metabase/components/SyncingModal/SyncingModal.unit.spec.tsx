import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SyncingModal from "./SyncingModal";

describe("SyncingModal", () => {
  it("should render with a table from the sample database", () => {
    render(<SyncingModal sampleUrl={"/auto/table/1"} />);

    expect(screen.getByText("Explore sample data")).toBeInTheDocument();
  });

  it("should render with no sample database", () => {
    const onClose = jest.fn();

    render(<SyncingModal onClose={onClose} />);
    userEvent.click(screen.getByText("Got it"));

    expect(onClose).toHaveBeenCalled();
  });
});
