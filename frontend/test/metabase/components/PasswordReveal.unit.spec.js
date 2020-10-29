import React from "react";
import { render, fireEvent } from "@testing-library/react";
import PasswordReveal from "metabase/components/PasswordReveal";

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
