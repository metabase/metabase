import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import Tab from "../Tab";

import TabList from "./TabList";

const TestTabList = () => {
  const [value, setValue] = useState(1);

  return (
    <TabList value={value} onChange={setValue}>
      <Tab value={1}>Tab 1</Tab>
      <Tab value={2}>Tab 2</Tab>
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
