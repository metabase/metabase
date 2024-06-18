import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { TabButton } from "../TabButton";

import { TabRow } from "./TabRow";

const TestTabRow = () => {
  const [value, setValue] = useState(1);

  return (
    <TabRow value={value} onChange={setValue}>
      <TabButton label="Tab 1" value={1} />
      <TabButton label="Tab 2" value={2} />
    </TabRow>
  );
};

describe("TabRow", () => {
  it("should navigate between tabs", async () => {
    render(<TestTabRow />);

    const option1 = screen.getByRole("tab", { name: "Tab 1" });
    const option2 = screen.getByRole("tab", { name: "Tab 2" });
    expect(option1).toHaveAttribute("aria-selected", "true");
    expect(option2).toHaveAttribute("aria-selected", "false");

    await userEvent.click(option2);
    expect(option1).toHaveAttribute("aria-selected", "false");
    expect(option2).toHaveAttribute("aria-selected", "true");
  });
});
