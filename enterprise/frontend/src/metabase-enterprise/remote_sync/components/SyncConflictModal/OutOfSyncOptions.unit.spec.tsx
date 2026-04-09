import { render, screen } from "__support__/ui";
import type { RemoteSyncConflictVariant } from "metabase-types/api";

import { OutOfSyncOptions } from "./OutOfSyncOptions";

type SetupOpts = {
  isRemoteSyncReadOnly?: boolean;
  variant: RemoteSyncConflictVariant;
};

const setup = ({ variant, isRemoteSyncReadOnly = false }: SetupOpts) => {
  render(
    <OutOfSyncOptions
      currentBranch="main"
      handleOptionChange={jest.fn}
      isRemoteSyncReadOnly={isRemoteSyncReadOnly}
      variant={variant}
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
          /Force push to main \(this will overwrite the remote branch\)/,
        ),
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
          /Force push to main \(this will overwrite the remote branch\)/,
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
});
