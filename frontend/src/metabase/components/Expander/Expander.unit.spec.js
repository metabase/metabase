import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Expander from "./Expander";

const TestExpander = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Expander isExpanded={isExpanded} onChange={setIsExpanded}>
      {isExpanded ? "Expanded" : " Collapsed"}
    </Expander>
  );
};

describe("Expander", () => {
  it("should toggle between collapsed and expanded states", () => {
    render(<TestExpander />);

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveTextContent("Collapsed");

    userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveTextContent("Expanded");
  });
});
