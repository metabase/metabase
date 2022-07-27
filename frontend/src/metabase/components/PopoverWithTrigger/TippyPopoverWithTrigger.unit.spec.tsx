import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const user = userEvent.setup({ delay: null });

import TippyPopoverWithTrigger, {
  TippyPopoverWithTriggerProps,
} from "./TippyPopoverWithTrigger";

function setup(props: TippyPopoverWithTriggerProps) {
  return render(
    <div>
      <div>something outside of the popover</div>
      <TippyPopoverWithTrigger {...props} />
    </div>,
  );
}

const popoverContent = <div>popover content</div>;
const triggerContent = "trigger content";

describe("TippyPopoverWithTrigger", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    setup({
      popoverContent,
      triggerContent,
    });
  });

  it("should show the popover when user clicks the trigger", async () => {
    await user.click(screen.getByText(triggerContent));
    expect(await screen.findByText("popover content")).toBeVisible();
  });

  it("should hide the popover if the user clicks outside of the popover", async () => {
    await user.click(screen.getByText(triggerContent));
    expect(await screen.findByText("popover content")).toBeVisible();

    await user.click(screen.getByText("something outside of the popover"));
    expect(await screen.findByText("popover content")).not.toBeVisible();
  });

  it("should hide the popover if the user presses the escape key while the popover is open", async () => {
    await user.click(screen.getByText(triggerContent));
    expect(await screen.findByText("popover content")).toBeVisible();

    await user.type(document.body, "{Escape}");
    expect(await screen.findByText("popover content")).not.toBeVisible();
  });
});
