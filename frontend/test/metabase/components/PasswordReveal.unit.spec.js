import React from "react";
import { render, fireEvent, cleanup } from "@testing-library/react";
import PasswordReveal from "metabase/components/PasswordReveal";

// This shouldn't be needed from version 9.0.0 of react-testing-library (TODO: remove after update)
afterEach(cleanup);

describe("password reveal", () => {
  it("should toggle the visibility state when hide / show are clicked", () => {
    const { getByText } = render(<PasswordReveal />);

    fireEvent.click(getByText("Show"));
    getByText("Hide");
  });

  it("should render a copy button", () => {
    const { getByTestId } = render(<PasswordReveal />);
    // implicit assertion => it will throw an error if element is not found
    getByTestId("copy-button");
  });
});
