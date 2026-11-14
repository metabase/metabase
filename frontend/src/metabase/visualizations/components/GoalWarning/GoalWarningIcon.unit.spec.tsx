import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { GoalWarningIcon } from "./GoalWarningIcon";

type SetupOpts = {
  source: "goal" | "color-ranges";
};

function setup({ source }: SetupOpts) {
  renderWithProviders(<GoalWarningIcon source={source} onClick={jest.fn()} />);
}

describe("GoalWarningIcon", () => {
  it("describes a goal warning with its tooltip message while the tooltip is closed", () => {
    setup({ source: "goal" });

    expect(
      screen.getByRole("button", { name: "Goal warning" }),
    ).toHaveAccessibleDescription(
      "Couldn't get the goal value. Click to open settings.",
    );
  });

  it("keeps describing the warning with its tooltip message while the tooltip is open", async () => {
    setup({ source: "goal" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await userEvent.hover(screen.getByRole("button", { name: "Goal warning" }));

    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Goal warning" }),
    ).toHaveAccessibleDescription(
      "Couldn't get the goal value. Click to open settings.",
    );
  });

  it("describes a color ranges warning with its tooltip message while the tooltip is closed", () => {
    setup({ source: "color-ranges" });

    expect(
      screen.getByRole("button", { name: "Goal warning" }),
    ).toHaveAccessibleDescription(
      "Couldn't get some color range values. Click to open settings.",
    );
  });
});
