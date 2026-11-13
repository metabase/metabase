import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { act, render, screen } from "__support__/ui";

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
  it("preserves a closing draft and keeps the editor when reopened during collapse", async () => {
    jest.useFakeTimers();
    const { clear, type } = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });
    const { rerender } = setup();
    const input = screen.getByRole("textbox", { name: "Formula" });
    await clear(input);
    await type(input, "Edited formula");

    rerender(<FormulaBarFrame>{null}</FormulaBarFrame>);
    expect(screen.getByDisplayValue("Edited formula")).toBe(input);
    expect(input).not.toHaveFocus();

    rerender(
      <FormulaBarFrame>
        <Draft key="next" />
      </FormulaBarFrame>,
    );
    const reopenedInput = screen.getByDisplayValue("Initial formula");
    await clear(reopenedInput);
    await type(reopenedInput, "Reopened formula");
    await act(async () => jest.advanceTimersByTime(1000));
    expect(screen.getByDisplayValue("Reopened formula")).toHaveFocus();

    rerender(<FormulaBarFrame>{null}</FormulaBarFrame>);
    await act(async () => jest.runOnlyPendingTimers());
    expect(
      screen.queryByDisplayValue("Reopened formula"),
    ).not.toBeInTheDocument();
  });
});
