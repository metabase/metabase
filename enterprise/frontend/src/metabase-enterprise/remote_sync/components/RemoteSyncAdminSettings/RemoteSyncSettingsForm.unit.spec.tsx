import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";

import {
  createMockLibraryCollection,
  setup,
} from "./RemoteSyncSettingsForm.setup.spec";

describe("RemoteSyncSettingsForm", () => {
  it("should display Git settings section with URL and Token fields", async () => {
    setup();

    expect(screen.getByText("Git settings")).toBeInTheDocument();
    expect(screen.getByLabelText(/Repository URL/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Access token/i)).toBeInTheDocument();
  });

  it("should display Sync Mode section with radio options", async () => {
    setup();

    expect(screen.getByText("Sync mode for this instance")).toBeInTheDocument();
    expect(screen.getByLabelText("Read-only")).toBeInTheDocument();
    expect(screen.getByLabelText("Read-write")).toBeInTheDocument();
  });

  it("should show set up help link", async () => {
    setup();
    expect(
      screen.getByRole("link", { name: "setup guide" }),
    ).toBeInTheDocument();
  });

  describe("conditional branch section", () => {
    it("should show branch settings when read-only mode is selected", async () => {
      setup({ remoteSyncType: "read-only" });

      expect(screen.getByText("Branch to sync with")).toBeInTheDocument();
      expect(screen.getByLabelText(/Sync branch/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Auto-sync with git/i)).toBeInTheDocument();
    });

    it("should hide branch settings when read-write mode is selected", async () => {
      setup({ remoteSyncType: "read-write" });

      // Wait for the form to be fully rendered
      await waitFor(() => {
        expect(screen.getByLabelText("Read-write")).toBeChecked();
      });

      expect(screen.queryByText("Branch to sync with")).not.toBeInTheDocument();
    });
  });

  describe("submit behavior - read-write mode", () => {
    it("should show the 'Save changes' button", async () => {
      const libraryCollection = createMockLibraryCollection({ id: 999 });

      setup({
        remoteSyncType: "read-write",
        remoteSyncUrl: "https://github.com/test/repo.git",
        remoteSyncEnabled: true,
        libraryCollection,
      });

      // Verify the submit button shows correct text for existing setup
      expect(
        screen.getByRole("button", { name: /Save changes/i }),
      ).toBeInTheDocument();
    });
  });

  describe("submit behavior - read-only mode", () => {
    beforeEach(() => {
      setup({
        remoteSyncType: "read-only",
        remoteSyncUrl: "",
        remoteSyncEnabled: false,
      });
    });

    it("should show the 'Set up Remote Sync' button", async () => {
      // Verify the submit button shows correct text for new setup
      expect(
        screen.getByRole("button", { name: /Set up Remote Sync/i }),
      ).toBeInTheDocument();
    });

    it("should show the 'Branch to sync with' section", async () => {
      expect(
        screen.getByRole("heading", { name: "Branch to sync with" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("switch", { name: "Auto-sync with git" }),
      ).toBeInTheDocument();
    });
  });

  describe("cancel behavior", () => {
    it("does not show the cancel button if onCancel is not set", () => {
      setup({
        onCancel: undefined,
        remoteSyncUrl: "https://github.com/test/repo.git",
      });
      expect(
        screen.queryByRole("button", { name: "Cancel" }),
      ).not.toBeInTheDocument();
    });

    it("should close modal when Cancel is clicked", async () => {
      const onCancel = jest.fn();

      setup({
        onCancel,
        remoteSyncUrl: "https://github.com/test/repo.git",
      });

      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      await userEvent.click(cancelButton);

      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe("read-only mode restriction", () => {
    it("should disable read-only option when there are unsynced changes", async () => {
      const dirty = [
        { id: 1, name: "Test Card", model: "card", sync_status: "update" },
      ];

      setup({
        remoteSyncType: "read-write",
        remoteSyncEnabled: true,
        dirty,
      });

      await waitFor(() => {
        const readOnlyRadio = screen.getByLabelText("Read-only");
        expect(readOnlyRadio).toBeDisabled();
      });
    });
  });

  describe("settings-modal variant", () => {
    it("should show info text when read-write mode is selected", async () => {
      setup({ remoteSyncType: "read-write", variant: "settings-modal" });

      await waitFor(() => {
        expect(
          screen.getByText(/Library collection will be enabled for syncing/i),
        ).toBeInTheDocument();
      });
    });

    it("should now show set up help link", async () => {
      setup({ variant: "settings-modal" });
      expect(
        screen.queryByRole("link", { name: "setup guide" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("transforms sync toggle", () => {
    afterEach(() => {
      PLUGIN_TRANSFORMS.isEnabled = false;
    });

    it("should not display transforms toggle when transforms feature is disabled", () => {
      setup({
        remoteSyncEnabled: true,
        remoteSyncType: "read-write",
        remoteSyncUrl: "https://github.com/test/repo.git",
      });

      expect(
        screen.queryByLabelText("Sync Transforms"),
      ).not.toBeInTheDocument();
    });

    it("should display transforms row in collections list when transforms feature is enabled", async () => {
      PLUGIN_TRANSFORMS.isEnabled = true;

      setup({
        remoteSyncEnabled: true,
        remoteSyncType: "read-write",
        remoteSyncUrl: "https://github.com/test/repo.git",
      });

      // Wait for the form to be fully rendered with read-write mode
      await waitFor(() => {
        expect(screen.getByLabelText("Read-write")).toBeChecked();
      });

      expect(screen.getByLabelText("Sync Transforms")).toBeInTheDocument();
    });

    it("should not display transforms row in modal variant (collections section is hidden)", async () => {
      PLUGIN_TRANSFORMS.isEnabled = true;

      setup({
        remoteSyncEnabled: true,
        remoteSyncType: "read-write",
        remoteSyncUrl: "https://github.com/test/repo.git",
        variant: "settings-modal",
      });

      // Wait for the form to be fully rendered with read-write mode
      await waitFor(() => {
        expect(screen.getByLabelText("Read-write")).toBeChecked();
      });

      // In modal variant, collections section is hidden, so transforms row is also hidden
      expect(
        screen.queryByLabelText("Sync Transforms"),
      ).not.toBeInTheDocument();
    });
  });

  describe("collections to sync section", () => {
    it("should display collections section in admin variant when read-write mode is selected during initial setup", async () => {
      setup({
        remoteSyncEnabled: false,
        remoteSyncType: "read-write",
      });

      // Wait for the form to be fully rendered with read-write mode
      await waitFor(() => {
        expect(screen.getByLabelText("Read-write")).toBeChecked();
      });

      expect(screen.getByText("Collections to sync")).toBeInTheDocument();
    });

    it("should not display collections section in modal variant when read-write mode is selected", async () => {
      setup({
        remoteSyncEnabled: false,
        remoteSyncType: "read-write",
        variant: "settings-modal",
      });

      // Wait for the form to be fully rendered with read-write mode
      await waitFor(() => {
        expect(screen.getByLabelText("Read-write")).toBeChecked();
      });

      // Collections section (which includes transforms row) should not appear in modal variant
      expect(screen.queryByText("Collections to sync")).not.toBeInTheDocument();
    });

    it("should not display collections section in modal variant even when remote sync is enabled", async () => {
      setup({
        remoteSyncEnabled: true,
        remoteSyncType: "read-write",
        remoteSyncUrl: "https://github.com/test/repo.git",
        variant: "settings-modal",
      });

      // Wait for the form to be fully rendered with read-write mode
      await waitFor(() => {
        expect(screen.getByLabelText("Read-write")).toBeChecked();
      });

      // Collections section (which includes transforms row) should not appear in modal variant
      expect(screen.queryByText("Collections to sync")).not.toBeInTheDocument();
    });
  });
});
