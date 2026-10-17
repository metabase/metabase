import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { DetailSidebarHeader } from "./DetailSidebarHeader";

type SetupOpts = {
  prevId?: string;
  nextId?: string;
};

const setup = ({ prevId, nextId }: SetupOpts = {}) => {
  const onNavigate = jest.fn();
  const onClose = jest.fn();

  renderWithProviders(
    <DetailSidebarHeader
      prevId={prevId}
      nextId={nextId}
      previousLabel="Previous item"
      nextLabel="Next item"
      detailPath="/monitor/items/shown"
      onNavigate={onNavigate}
      onClose={onClose}
    />,
    { withUndos: true },
  );

  return { onNavigate, onClose };
};

describe("DetailSidebarHeader", () => {
  it("steps to the previous and next items", async () => {
    const { onNavigate } = setup({ prevId: "before", nextId: "after" });

    await userEvent.click(
      screen.getByRole("button", { name: "Previous item" }),
    );
    expect(onNavigate).toHaveBeenLastCalledWith("before");

    await userEvent.click(screen.getByRole("button", { name: "Next item" }));
    expect(onNavigate).toHaveBeenLastCalledWith("after");
  });

  it("can't step past either end", () => {
    setup();

    expect(
      screen.getByRole("button", { name: "Previous item" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next item" })).toBeDisabled();
  });

  it("copies a link to the item", async () => {
    setup();
    jest.mocked(navigator.clipboard.writeText).mockClear();

    await userEvent.click(
      screen.getByRole("button", { name: "Copy link to clipboard" }),
    );

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/monitor/items/shown`,
    );
    expect(
      await screen.findByText("Link copied to clipboard"),
    ).toBeInTheDocument();
  });

  it("closes", async () => {
    const { onClose } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
