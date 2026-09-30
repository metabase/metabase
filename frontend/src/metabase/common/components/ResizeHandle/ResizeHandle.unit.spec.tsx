import { render, screen } from "__support__/ui";

import { ResizeHandle } from "./ResizeHandle";

describe("ResizeHandle", () => {
  it.each(["e", "w"] as const)(
    "renders the %s handle with no visible content by default",
    (handleAxis) => {
      render(<ResizeHandle handleAxis={handleAxis} data-testid="handle" />);

      expect(screen.getByTestId("handle")).toBeEmptyDOMElement();
    },
  );

  it.each(["n", "s"] as const)(
    "renders the %s handle with a visible grip",
    (handleAxis) => {
      render(<ResizeHandle handleAxis={handleAxis} data-testid="handle" />);

      expect(screen.getByTestId("handle")).not.toBeEmptyDOMElement();
    },
  );

  it("renders nothing without an axis", () => {
    render(<ResizeHandle data-testid="handle" />);

    expect(screen.queryByTestId("handle")).not.toBeInTheDocument();
  });
});
