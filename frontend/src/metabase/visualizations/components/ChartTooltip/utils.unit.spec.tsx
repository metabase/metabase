import { render, screen } from "__support__/ui";

import { renderWithLineBreaks } from "./utils";

describe("renderWithLineBreaks", () => {
  it("should return non-string values as-is", () => {
    expect(renderWithLineBreaks(42)).toBe(42);
    expect(renderWithLineBreaks(null)).toBe(null);
    expect(renderWithLineBreaks(undefined)).toBe(undefined);
  });

  it("should return strings without newlines as-is", () => {
    expect(renderWithLineBreaks("hello world")).toBe("hello world");
  });

  it("should return empty string as-is", () => {
    expect(renderWithLineBreaks("")).toBe("");
  });

  it("should convert newlines to <br /> elements", () => {
    render(
      <span data-testid="target">
        {renderWithLineBreaks("Line 1\nLine 2")}
      </span>,
    );

    const el = screen.getByTestId("target");
    expect(el.innerHTML).toBe("Line 1<br>Line 2");
  });

  it("should handle multiple newlines", () => {
    render(<span data-testid="target">{renderWithLineBreaks("A\nB\nC")}</span>);

    const el = screen.getByTestId("target");
    expect(el.innerHTML).toBe("A<br>B<br>C");
  });

  it("should cap at 3 lines and add ellipsis", () => {
    render(
      <span data-testid="target">
        {renderWithLineBreaks("L1\nL2\nL3\nL4\nL5")}
      </span>,
    );

    const el = screen.getByTestId("target");
    expect(el.innerHTML).toBe("L1<br>L2<br>L3\u2026");
  });

  it("should not add ellipsis when exactly at the line limit", () => {
    render(
      <span data-testid="target">{renderWithLineBreaks("L1\nL2\nL3")}</span>,
    );

    const el = screen.getByTestId("target");
    expect(el.innerHTML).toBe("L1<br>L2<br>L3");
  });
});
