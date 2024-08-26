import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CollapseSection from "./CollapseSection";

function setup({
  header = "Collapse Header",
  initialState = "collapsed",
  ...props
}: {
  header?: string | React.ReactNode;
  initialState?: "collapsed" | "expanded";
  [key: string]: any;
} = {}) {
  return render(
    <CollapseSection header={header} initialState={initialState} {...props}>
      <p>Inside Text</p>
    </CollapseSection>,
  );
}

describe("CollapseSection", () => {
  it("hides content", () => {
    setup({ initialState: "collapsed" });
    expect(screen.queryByText("Inside Text")).not.toBeInTheDocument();
  });

  it("can render in expanded state", () => {
    setup({ initialState: "expanded" });
    expect(screen.queryByText("Inside Text")).toBeVisible();
  });

  it("shows header", () => {
    setup({ header: "Header" });
    expect(screen.getByText("Header")).toBeInTheDocument();
    expect(screen.getByLabelText("chevronright icon")).toBeInTheDocument();
  });

  it("expands content when header is clicked", () => {
    setup();

    fireEvent.click(screen.getByText("Collapse Header"));

    expect(screen.getByText("Inside Text")).toBeInTheDocument();
    expect(screen.getByText("Inside Text")).toBeVisible();
  });

  it("expands content when icon is clicked", () => {
    setup();

    fireEvent.click(screen.getByLabelText("chevronright icon"));

    expect(screen.getByText("Inside Text")).toBeInTheDocument();
    expect(screen.getByText("Inside Text")).toBeVisible();
  });

  it("collapses content when header is clicked", () => {
    setup({ initialState: "expanded" });
    fireEvent.click(screen.getByText("Collapse Header"));
    expect(screen.queryByText("Inside Text")).not.toBeInTheDocument();
  });

  it("collapses content when icon is clicked", () => {
    setup({ initialState: "expanded" });
    fireEvent.click(screen.getByLabelText("chevrondown icon"));
    expect(screen.queryByText("Inside Text")).not.toBeInTheDocument();
  });

  it("renders custom header", () => {
    setup({ header: <h1>Custom Header</h1> });
    expect(screen.getByText("Custom Header")).toBeInTheDocument();
  });

  it("uses different icons for 'up-down' icon variant", async () => {
    setup({ iconVariant: "up-down" });
    expect(screen.getByLabelText("chevrondown icon")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("chevrondown icon"));
    expect(screen.getByLabelText("chevronup icon")).toBeInTheDocument();
  });
});
