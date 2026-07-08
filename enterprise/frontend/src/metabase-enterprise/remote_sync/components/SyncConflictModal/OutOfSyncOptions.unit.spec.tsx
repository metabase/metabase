import { render, screen } from "__support__/ui";
import type { RemoteSyncConflictVariant } from "metabase-types/api";

import { OutOfSyncOptions } from "./OutOfSyncOptions";

type SetupOpts = {
  isRemoteSyncReadOnly?: boolean;
  variant: RemoteSyncConflictVariant;
  canMerge?: boolean;
};

const setup = ({
  variant,
  isRemoteSyncReadOnly = false,
  canMerge,
}: SetupOpts) => {
  render(
    <OutOfSyncOptions
      currentBranch="main"
      handleOptionChange={jest.fn}
      isRemoteSyncReadOnly={isRemoteSyncReadOnly}
      variant={variant}
      canMerge={canMerge}
    />,
  );
};

describe("OutOfSyncOptions", () => {
  describe("push variant", () => {
    it("shows correct options", () => {
      setup({ variant: "push" });
      expect(screen.getAllByRole("radio")).toHaveLength(2);
      expect(
        screen.getByLabelText(/Create a new branch and push changes there/),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(
          /Force push to main, discarding and overwriting everything/,
        ),
      ).toBeInTheDocument();
    });

    it("offers a merge option when the merge is clean", () => {
      setup({ variant: "push", canMerge: true });
      expect(screen.getAllByRole("radio")).toHaveLength(3);
      expect(
        screen.getByLabelText(/Merge the remote changes with yours and push/),
      ).toBeInTheDocument();
    });
  });

  describe("switch-branch variant", () => {
    it("shows correct options", () => {
      setup({ variant: "switch-branch" });
      expect(screen.getAllByRole("radio")).toHaveLength(3);
      expect(
        screen.getByLabelText(/Push changes to the current branch, main/),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(/Create a new branch and push changes there/),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(/Delete unsynced changes/),
      ).toBeInTheDocument();
    });
  });

  describe("pull variant (default)", () => {
    it("shows correct options when remote sync is read-write", () => {
      setup({ variant: "pull", isRemoteSyncReadOnly: false });
      expect(screen.getAllByRole("radio")).toHaveLength(3);
      expect(
        screen.getByLabelText(
          /Force push to main, discarding and overwriting everything/,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(/Create a new branch and push changes there/),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(/Delete unsynced changes/),
      ).toBeInTheDocument();
    });

    it("shows correct options when remote sync is read-only", () => {
      setup({ variant: "pull", isRemoteSyncReadOnly: true });
      expect(screen.getAllByRole("radio")).toHaveLength(1);
      expect(
        screen.getByLabelText(/Delete unsynced changes/),
      ).toBeInTheDocument();
    });

    it("offers a local merge option when the merge is clean", () => {
      setup({ variant: "pull", isRemoteSyncReadOnly: false, canMerge: true });
      expect(screen.getAllByRole("radio")).toHaveLength(4);
      expect(
        screen.getByLabelText(
          /Merge the remote changes into your local content/,
        ),
      ).toBeInTheDocument();
    });

    it("does not offer merge when read-only even if clean", () => {
      setup({ variant: "pull", isRemoteSyncReadOnly: true, canMerge: true });
      expect(screen.getAllByRole("radio")).toHaveLength(1);
      expect(
        screen.getByLabelText(/Delete unsynced changes/),
      ).toBeInTheDocument();
    });
  });

  describe("setup variant", () => {
    it("shows correct options when remote sync is read-write", () => {
      setup({ variant: "setup", isRemoteSyncReadOnly: false });
      expect(screen.getAllByRole("radio")).toHaveLength(2);
      expect(
        screen.getByLabelText(/Create a new branch and push changes there/),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(/Delete unsynced changes/),
      ).toBeInTheDocument();
    });

    it("shows correct options when remote sync is read-only", () => {
      setup({ variant: "setup", isRemoteSyncReadOnly: true });
      expect(screen.getAllByRole("radio")).toHaveLength(1);
      expect(
        screen.getByLabelText(/Delete unsynced changes/),
      ).toBeInTheDocument();
    });
  });

  describe("safe vs destructive grouping", () => {
    it("splits options into a safe and a destructive group", () => {
      setup({ variant: "push" });
      expect(screen.getByText("Keep all changes")).toBeInTheDocument();
      expect(screen.getByText(/Permanently lose changes/)).toBeInTheDocument();
    });

    it("shows only the destructive group when every option is destructive", () => {
      setup({ variant: "pull", isRemoteSyncReadOnly: true });
      expect(screen.getByText(/Permanently lose changes/)).toBeInTheDocument();
      expect(screen.queryByText("Keep all changes")).not.toBeInTheDocument();
    });
  });
});
