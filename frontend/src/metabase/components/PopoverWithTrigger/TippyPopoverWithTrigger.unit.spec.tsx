import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import TippyPopoverWithTrigger from "./TippyPopoverWithTrigger";

function setup() {
  return render(
    <div>
      <div>something outside of the popover</div>
      <TippyPopoverWithTrigger
        popoverContent={<div>popover content</div>}
        triggerContent="trigger content"
      />
    </div>,
  );
}

describe("TippyPopoverWithTrigger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should show the popover when user clicks the trigger", async () => {
    setup();
    await userEvent.click(screen.getByText("trigger content"));
    expect(await screen.findByText("popover content")).toBeVisible();
  });

  it("should hide the popover if the user clicks outside of the popover", async () => {
    setup();
    await userEvent.click(screen.getByText("trigger content"));
    expect(await screen.findByText("popover content")).toBeVisible();

    await userEvent.click(screen.getByText("something outside of the popover"));
    expect(await screen.findByText("popover content")).not.toBeVisible();
  });

  it("should hide the popover if the user presses the escape key while the popover is open", async () => {
    setup();
    await userEvent.click(screen.getByText("trigger content"));
    expect(await screen.findByText("popover content")).toBeVisible();

    await userEvent.type(document.body, "{Escape}");
    expect(await screen.findByText("popover content")).not.toBeVisible();
  });
});
