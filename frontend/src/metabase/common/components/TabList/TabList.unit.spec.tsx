import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { render, screen } from "__support__/ui";

import { TabButton } from "../TabButton";

import { TabList } from "./TabList";

const TestTabList = () => {
  const [value, setValue] = useState(1);

  return (
    <TabList value={value} onChange={setValue}>
      <TabButton label="Tab 1" value={1} />
      <TabButton label="Tab 2" value={2} />
    </TabList>
  );
};

describe("TabList", () => {
  it("should navigate between tabs", async () => {
    render(<TestTabList />);

    const option1 = screen.getByRole("tab", { name: "Tab 1" });
    const option2 = screen.getByRole("tab", { name: "Tab 2" });
    expect(option1).toHaveAttribute("aria-selected", "true");
    expect(option2).toHaveAttribute("aria-selected", "false");

    await userEvent.click(option2);
    expect(option1).toHaveAttribute("aria-selected", "false");
    expect(option2).toHaveAttribute("aria-selected", "true");
  });
});
