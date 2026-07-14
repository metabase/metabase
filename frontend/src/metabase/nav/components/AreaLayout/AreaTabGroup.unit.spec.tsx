import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { AreaTabGroup } from "./AreaTabGroup";

interface SetupOpts {
  isActive?: boolean;
  showLabel?: boolean;
}

const setup = ({ isActive = false, showLabel = true }: SetupOpts = {}) => {
  const { rerender } = renderWithProviders(
    <AreaTabGroup
      label="Content management"
      icon="folder"
      isActive={isActive}
      showLabel={showLabel}
    >
      <div data-testid="child">{"Child item"}</div>
    </AreaTabGroup>,
  );

  const rerenderWith = (opts: SetupOpts) =>
    rerender(
      <AreaTabGroup
        label="Content management"
        icon="folder"
        isActive={opts.isActive ?? isActive}
        showLabel={opts.showLabel ?? showLabel}
      >
        <div data-testid="child">{"Child item"}</div>
      </AreaTabGroup>,
    );

  return { rerenderWith };
};

const getHeader = () =>
  screen.getByRole("button", { name: "Content management" });

describe("AreaTabGroup", () => {
  it("is collapsed by default, hiding its children", () => {
    setup();

    expect(getHeader()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("child")).not.toBeVisible();
  });

  it("is open on mount when active", async () => {
    setup({ isActive: true });

    expect(getHeader()).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(screen.getByTestId("child")).toBeVisible());
  });

  it("toggles open and closed on header click", async () => {
    setup();

    await userEvent.click(getHeader());
    expect(getHeader()).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(screen.getByTestId("child")).toBeVisible());

    await userEvent.click(getHeader());
    expect(getHeader()).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(screen.getByTestId("child")).not.toBeVisible());
  });

  it("opens when it becomes active (navigation into the group)", async () => {
    const { rerenderWith } = setup({ isActive: false });

    expect(screen.getByTestId("child")).not.toBeVisible();

    rerenderWith({ isActive: true });

    expect(getHeader()).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(screen.getByTestId("child")).toBeVisible());
  });

  it("never auto-closes when the group stops being active", async () => {
    const { rerenderWith } = setup({ isActive: true });

    expect(getHeader()).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(screen.getByTestId("child")).toBeVisible());

    rerenderWith({ isActive: false });

    expect(getHeader()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("child")).toBeVisible();
  });

  it("marks the header as the current location when an active group is collapsed", async () => {
    setup({ isActive: true });

    expect(getHeader()).not.toHaveAttribute("aria-current");

    await userEvent.click(getHeader());

    expect(getHeader()).toHaveAttribute("aria-expanded", "false");
    expect(getHeader()).toHaveAttribute("aria-current", "location");
  });

  it("does not mark an inactive collapsed group as the current location", () => {
    setup({ isActive: false });

    expect(getHeader()).toHaveAttribute("aria-expanded", "false");
    expect(getHeader()).not.toHaveAttribute("aria-current");
  });

  it("stays reachable and toggleable in icon-only mode without label/chevron UI", async () => {
    setup({ showLabel: false });

    const header = getHeader();
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Content management")).not.toBeInTheDocument();
    expect(screen.getByTestId("child")).not.toBeVisible();

    await userEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(screen.getByTestId("child")).toBeVisible());

    await userEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(screen.getByTestId("child")).not.toBeVisible());
  });
});
