import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TabButton from "../TabButton";
import TabRow from "./TabRow";

const TestTabRow = () => {
  const [value, setValue] = useState(1);

  return (
    <TabRow value={value} onChange={setValue}>
      <TabButton value={1}>Tab 1</TabButton>
      <TabButton value={2}>Tab 2</TabButton>
    </TabRow>
  );
};

describe("TabList", () => {
  it("should navigate between tabs", () => {
    render(<TestTabRow />);

    const option1 = screen.getByRole("tab", { name: "Tab 1" });
    const option2 = screen.getByRole("tab", { name: "Tab 2" });
    expect(option1).toHaveAttribute("aria-selected", "true");
    expect(option2).toHaveAttribute("aria-selected", "false");

    userEvent.click(option2);
    expect(option1).toHaveAttribute("aria-selected", "false");
    expect(option2).toHaveAttribute("aria-selected", "true");
  });
});
