/* eslint-disable react/prop-types */
import React, { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

const children = <div>popover content</div>;
const triggerContent = "trigger content";

describe("TippyPopoverWithTrigger", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    setup({
      children,
      triggerContent,
    });
  });

  it("should show the popover when user clicks the trigger", async () => {
    userEvent.click(screen.getByText(triggerContent));
    expect(await screen.findByText("popover content")).toBeVisible();
  });

  it("should hide the popover if the user clicks outside of the popover", async () => {
    userEvent.click(screen.getByText(triggerContent));
    expect(await screen.findByText("popover content")).toBeVisible();

    userEvent.click(screen.getByText("something outside of the popover"));
    expect(await screen.findByText("popover content")).not.toBeVisible();
  });

  it("should hide the popover if the user presses the escape key while the popover is open", async () => {
    userEvent.click(screen.getByText(triggerContent));
    expect(await screen.findByText("popover content")).toBeVisible();

    userEvent.type(document.body, "{Escape}");
    expect(await screen.findByText("popover content")).not.toBeVisible();
  });
});
