import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import ChartSettingFieldsPicker from "metabase/visualizations/components/settings/ChartSettingFieldsPicker";

const DEFAULT_PROPS = {
  options: [
    { name: "Count", value: "count" },
    { name: "Average of Total", value: "avg" },
  ],
  colors: { avg: "#A989C5", count: "#509EE3" },
  columnHasSettings: () => true,
  value: ["avg", "count"],
  addAnother: "Add another series",
};

const setup = props => {
  renderWithProviders(
    <ChartSettingFieldsPicker {...DEFAULT_PROPS} {...props} />,
  );
};

describe("ChartSettingFieldsPicker", () => {
  it("Should render both options", () => {
    setup();

    expect(screen.getByText("Average of Total")).toBeInTheDocument();
    expect(screen.getByText("Count")).toBeInTheDocument();

    //Expect there to be remove icons for both
    expect(screen.getByTestId("remove-avg")).toBeInTheDocument();
    expect(screen.getByTestId("remove-count")).toBeInTheDocument();
  });

  it("should show you a button to add another metric if there are unused options", async () => {
    const onChange = jest.fn();

    setup({ value: ["avg"], onChange });

    expect(screen.getByText("Average of Total")).toBeInTheDocument();
    expect(screen.queryByTestId("remove-avg")).not.toBeInTheDocument();
    expect(screen.getByText("Add another series")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Add another series"));

    expect(onChange).toHaveBeenCalledWith(["avg", "count"]);
  });

  it("should allow you to change an existing metric if there are unused options", async () => {
    const onChange = jest.fn();

    setup({ value: ["avg"], onChange });

    expect(screen.getByText("Average of Total")).toBeInTheDocument();
    expect(screen.queryByTestId("remove-avg")).not.toBeInTheDocument();
    expect(screen.getByText("Add another series")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /chevrondown/i }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByText("Average of Total"));

    //Check to see that count is in the popover
    expect(screen.getByText("Count")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Count"));

    expect(onChange).toHaveBeenCalledWith(["count"]);
  });
});
