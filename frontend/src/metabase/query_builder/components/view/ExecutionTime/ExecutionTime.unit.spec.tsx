import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import { ExecutionTime } from "./ExecutionTime";

describe("ExecutionTime", () => {
  it("renders nothing when no time is provided (metabase#45730)", () => {
    render(
      <div data-testid="test-container">
        <ExecutionTime />
      </div>,
    );
    const container = screen.getByTestId("test-container");
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when time is `null`", () => {
    render(
      <div data-testid="test-container">
        <ExecutionTime time={null} />
      </div>,
    );
    const container = screen.getByTestId("test-container");

    expect(container).toBeEmptyDOMElement();
  });

  it("renders formatted time when time is provided", () => {
    render(<ExecutionTime time={100} />);

    expect(screen.getByTestId("execution-time")).toHaveTextContent("100ms");
  });

  it("renders formatted time when time is provided, but the time is 0", () => {
    render(<ExecutionTime time={0} />);

    expect(screen.getByTestId("execution-time")).toHaveTextContent("0ms");
  });

  it("shows tooltip", async () => {
    render(<ExecutionTime time={100} />);

    await userEvent.hover(screen.getByTestId("execution-time"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "How long this query took",
    );
  });
});
