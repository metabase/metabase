import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Tab from "../Tab";
import TabList from "./TabList";

const TestTabList = () => {
  const [value, setValue] = useState(1);
  const [sortIconState, setSortIconState] = useState("default");

  return (
    <TabList
      value={value}
      onChange={setValue}
      sortIconState={sortIconState}
      setSortIconState={setSortIconState}
    >
      <Tab value={1} setSortIconState={setSortIconState}>
        Tab 1
      </Tab>
      <Tab value={2} setSortIconState={setSortIconState}>
        Tab 2
      </Tab>
    </TabList>
  );
};
describe("TabList", () => {
  it("should navigate between tabs and show the correct sort direction on the selected tab.", () => {
    render(<TestTabList />);

    const option1 = screen.getByRole("tab", { name: /Tab 1/ });
    const option2 = screen.getByRole("tab", { name: /Tab 2/ });

    expect(option1).toHaveAttribute("aria-selected", "true");
    expect(option1).toHaveTextContent("↑↓");
    expect(option2).toHaveAttribute("aria-selected", "false");

    userEvent.click(option1);
    expect(option1).toHaveAttribute("aria-selected", "true");
    expect(option1).toHaveTextContent("↑");
    expect(option2).toHaveAttribute("aria-selected", "false");

    userEvent.click(option2);
    expect(option1).toHaveAttribute("aria-selected", "false");
    expect(option2).toHaveAttribute("aria-selected", "true");
    expect(option2).toHaveTextContent("↑↓");
  });
});
