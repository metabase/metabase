import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Warnings from "metabase/query_builder/components/Warnings";

describe("Warnings", () => {
  it("should render a warning icon", () => {
    render(<Warnings warnings={["foo"]} />);
    expect(screen.getByLabelText("warning icon")).toBeInTheDocument();
  });

  it("should render a warning message tooltip on hover", () => {
    render(<Warnings warnings={["test warning message"]} />);
    userEvent.hover(screen.getByLabelText("warning icon"));
    expect(screen.getByText("test warning message")).toBeInTheDocument();
  });

  it("should render multiple warnings", () => {
    const warningMessages = ["foo", "bar", "baz"];
    render(<Warnings warnings={warningMessages} />);
    userEvent.hover(screen.getByLabelText("warning icon"));

    warningMessages.forEach(message => {
      expect(screen.getByText(message)).toBeInTheDocument();
    });
  });
});
