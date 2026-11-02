import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import * as Analytics from "metabase/analytics";

import { AppBarToggle } from "./AppBarToggle";

const setup = async () => {
  const onToggleClick = jest.fn();

  renderWithProviders(
    <AppBarToggle isNavBarEnabled isNavBarOpen onToggleClick={onToggleClick} />,
    { withKBar: true },
  );

  // The shortcut is registered from an effect; a keystroke dispatched in the
  // same tick as the initial render lands before that and is lost.
  await screen.findByRole("button", { name: "Toggle sidebar" });

  return { onToggleClick };
};

describe("AppBarToggle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("toggles the sidebar when the button is clicked", async () => {
    const { onToggleClick } = await setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Toggle sidebar" }),
    );

    expect(onToggleClick).toHaveBeenCalledTimes(1);
  });

  it("toggles the sidebar on [ and reports the shortcut", async () => {
    const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
    const { onToggleClick } = await setup();

    await userEvent.keyboard("[[");
    expect(onToggleClick).toHaveBeenCalledTimes(1);

    await userEvent.keyboard("[[");
    expect(onToggleClick).toHaveBeenCalledTimes(2);

    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "keyboard_shortcut_performed",
      event_detail: "toggle-navbar",
    });
  });

  it("does not report a shortcut when the button is clicked", async () => {
    const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
    await setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Toggle sidebar" }),
    );

    expect(trackSimpleEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "keyboard_shortcut_performed" }),
    );
  });

  it("ignores the shortcut while a text input holds focus", async () => {
    const { onToggleClick } = await setup();

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    await userEvent.keyboard("[[");
    expect(onToggleClick).not.toHaveBeenCalled();

    input.remove();
    document.body.focus();

    await userEvent.keyboard("[[");
    expect(onToggleClick).toHaveBeenCalledTimes(1);
  });
});
