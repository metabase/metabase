import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ExecutionTime } from "./ExecutionTime";

describe("ExecutionTime", () => {
  it("renders nothing when no time is provided (metabase#45730)", () => {
    const { container } = render(<ExecutionTime />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders formatted time when time is provided", () => {
    render(<ExecutionTime time={100} />);

    expect(screen.getByTestId("execution-time")).toHaveTextContent("100 ms");
  });

  it("shows tooltip", async () => {
    render(<ExecutionTime time={100} />);

    await userEvent.hover(screen.getByTestId("execution-time"));
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Query execution time",
    );
  });
});
