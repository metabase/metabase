import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { act, fireEvent, render, screen, waitFor } from "__support__/ui";

import { FormulaBarFrame } from "./FormulaBarFrame";

function Draft() {
  const [source, setSource] = useState("Initial formula");
  return (
    <input
      aria-label="Formula"
      value={source}
      onChange={(event) => setSource(event.target.value)}
      autoFocus
    />
  );
}

function setup() {
  return render(
    <FormulaBarFrame>
      <Draft />
    </FormulaBarFrame>,
  );
}

describe("FormulaBarFrame", () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  it("preserves the current draft during closing and removes its focus", async () => {
    const { rerender } = setup();
    const input = screen.getByRole("textbox", { name: "Formula" });
    await userEvent.clear(input);
    await userEvent.type(input, "Edited formula");

    rerender(<FormulaBarFrame>{null}</FormulaBarFrame>);

    expect(screen.getByDisplayValue("Edited formula")).toBe(input);
    expect(input).not.toHaveFocus();
    await waitFor(() => {
      expect(
        screen.queryByDisplayValue("Edited formula"),
      ).not.toBeInTheDocument();
    });
  });

  it("keeps a reopened editor after the previous closing transition", async () => {
    jest.useFakeTimers();
    const { rerender } = setup();
    rerender(<FormulaBarFrame>{null}</FormulaBarFrame>);
    rerender(
      <FormulaBarFrame>
        <Draft key="next" />
      </FormulaBarFrame>,
    );

    const input = screen.getByRole("textbox", { name: "Formula" });
    fireEvent.change(input, { target: { value: "Reopened formula" } });
    await act(async () => jest.advanceTimersByTime(1000));
    expect(screen.getByDisplayValue("Reopened formula")).toHaveFocus();
  });
});
