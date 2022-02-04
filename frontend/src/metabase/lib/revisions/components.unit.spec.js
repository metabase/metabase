import React from "react";
import { render, screen } from "@testing-library/react";
import { RevisionTitle, RevisionBatchedDescription } from "./components";

describe("RevisionTitle", () => {
  it("renders correctly", () => {
    render(<RevisionTitle username="Alex" message="added a description" />);
    expect(screen.queryByText("Alex added a description")).toBeInTheDocument();
  });
});

describe("RevisionBatchedDescription", () => {
  it("correctly renders two change records", () => {
    render(
      <RevisionBatchedDescription
        changes={["added a description", "archived this"]}
      />,
    );
    expect(
      screen.queryByText("Added a description and archived this"),
    ).toBeInTheDocument();
  });

  it("correctly renders more than two change records", () => {
    render(
      <RevisionBatchedDescription
        changes={["renamed this", "added a description", "archived this"]}
      />,
    );
    expect(
      screen.queryByText("Renamed this, added a description and archived this"),
    ).toBeInTheDocument();
  });

  it("correctly renders changes with JSX", () => {
    render(
      <RevisionBatchedDescription
        changes={["renamed this", ["moved to", <p key="1">Our analytics</p>]]}
      />,
    );
    expect(screen.queryByText("Renamed this and moved to Our analytics"));
  });
});
