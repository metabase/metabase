import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { EmbedModalContentStatusBar } from "./EmbedModalContentStatusBar";

const setup = (
  props: Partial<React.ComponentProps<typeof EmbedModalContentStatusBar>> = {},
) => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const onUnpublish = jest.fn().mockResolvedValue(undefined);
  const onDiscard = jest.fn();

  renderWithProviders(
    <EmbedModalContentStatusBar
      resourceType="dashboard"
      isPublished={false}
      hasSettingsChanges={false}
      onSave={onSave}
      onUnpublish={onUnpublish}
      onDiscard={onDiscard}
      {...props}
    />,
  );

  return { onSave, onUnpublish, onDiscard };
};

describe("EmbedModalContentStatusBar", () => {
  it("publishes when the resource is writable", async () => {
    const { onSave } = setup({ isReadOnly: false });

    const publish = screen.getByRole("button", { name: "Publish" });
    expect(publish).toBeEnabled();

    await userEvent.click(publish);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  // On a read-only remote-synced resource (can_write=false) the embed entry
  // point stays available, but publishing is disabled since the write would
  // fail (MB #72752).
  describe("read-only resource", () => {
    it("disables Publish and explains why in a tooltip", async () => {
      setup({ isReadOnly: true });

      const publish = screen.getByRole("button", { name: "Publish" });
      expect(publish).toBeDisabled();

      await userEvent.hover(publish);
      expect(
        await screen.findByText(/synced from another instance/),
      ).toBeInTheDocument();
    });

    it("disables Unpublish for an already-published read-only resource", () => {
      setup({ isReadOnly: true, isPublished: true });

      expect(screen.getByRole("button", { name: "Unpublish" })).toBeDisabled();
    });
  });
});
