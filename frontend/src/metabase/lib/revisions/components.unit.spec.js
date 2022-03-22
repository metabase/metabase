import React from "react";
import { render, renderWithProviders, screen } from "__support__/ui";
import { getCollectionChangeDescription } from "./revisions";
import { RevisionTitle, RevisionBatchedDescription } from "./components";

describe("RevisionTitle", () => {
  it("renders correctly", () => {
    render(<RevisionTitle username="Alex" message="added a description" />);
    expect(screen.queryByText("Alex added a description")).toBeInTheDocument();
  });
});

describe("RevisionBatchedDescription", () => {
  const originalWarn = console.warn;

  beforeAll(() => {
    console.warn = jest.fn();
  });

  afterAll(() => {
    console.warn = originalWarn;
  });

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

  it("should handle nested messages (metabase#20414)", () => {
    renderWithProviders(
      <RevisionBatchedDescription
        changes={[getCollectionChangeDescription(1, 2), "edited metadata"]}
      />,
    );
    expect(screen.getByText(/Moved this to/)).toBeInTheDocument();
    expect(screen.getByText(/edited metadata/)).toBeInTheDocument();
  });

  it("should use fallback when failing to format changes message", () => {
    render(
      <RevisionBatchedDescription
        changes={[{ key: "try to parse this" }, -1, false]}
        fallback="Just a fallback"
      />,
    );
    expect(screen.getByText("Just a fallback")).toBeInTheDocument();
  });
});
