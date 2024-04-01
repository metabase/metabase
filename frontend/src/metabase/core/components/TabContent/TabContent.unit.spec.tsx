import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import Tab from "../Tab";
import TabList from "../TabList";
import TabPanel from "../TabPanel";

import TabContent from "./TabContent";

const TestTabContent = () => {
  const [value, setValue] = useState(1);

  return (
    <TabContent value={value} onChange={setValue}>
      <TabList>
        <Tab value={1}>Tab 1</Tab>
        <Tab value={2}>Tab 2</Tab>
      </TabList>
      <TabPanel value={1}>Panel 1</TabPanel>
      <TabPanel value={2}>Panel 2</TabPanel>
    </TabContent>
  );
};

describe("TabContent", () => {
  it("should navigate between tabs", async () => {
    render(<TestTabContent />);
    expect(screen.getByText("Panel 1")).toBeInTheDocument();
    expect(screen.queryByText("Panel 2")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Tab 2" }));
    expect(screen.queryByText("Panel 1")).not.toBeInTheDocument();
    expect(screen.getByText("Panel 2")).toBeInTheDocument();
  });
});
