import { Button, Paper } from "@mantine/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { HoverCard } from ".";

const setup = () => {
  return render(
    <>
      <HoverCard>
        <HoverCard.Target>
          <Button>Target</Button>
        </HoverCard.Target>
        <HoverCard.Dropdown>
          <Paper>Dropdown</Paper>
        </HoverCard.Dropdown>
      </HoverCard>
      <Button>Another button</Button>
    </>,
  );
};

describe("HoverCard", () => {
  it("opens its dropdown when its target is focused, and closes the dropdown when the target is blurred", async () => {
    setup();

    // The dropdown should initially not be present
    expect(screen.queryByText("Dropdown")).not.toBeInTheDocument();

    // Let's move the focus to the HoverCard's target
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Target" })).toHaveFocus();

    // The dropdown should appear soon
    expect(await screen.findByText("Dropdown")).toBeVisible();

    // Let's move the focus to another button
    await userEvent.tab();
    expect(
      screen.getByRole("button", { name: "Another button" }),
    ).toHaveFocus();

    // The dropdown should disappear soon
    await waitFor(() => {
      expect(screen.queryByText("Dropdown")).not.toBeInTheDocument();
    });
  });
});
