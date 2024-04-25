import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import type { ExportFormatType } from "metabase/dashboard/components/PublicLinkPopover/types";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import type { PublicLinkPopoverProps } from "./PublicLinkPopover";
import { PublicLinkPopover } from "./PublicLinkPopover";

// https://github.com/nkbt/react-copy-to-clipboard/issues/106#issuecomment-605227151
jest.mock("copy-to-clipboard", () => jest.fn());

const TestComponent = ({
  createPublicLink,
  deletePublicLink,
  extensions,
  isOpen: mockIsOpen,
  onClose: mockIsClosed,
  url,
}: Omit<PublicLinkPopoverProps, "target">) => {
  const target = (
    <button data-testid="target" onClick={() => setIsOpen(true)}>
      Target
    </button>
  );
  const [isOpen, setIsOpen] = useState(mockIsOpen);
  const [extension, setExtension] = useState<ExportFormatType | null>(null);

  const linkExtension = extension ? `.${extension}` : "";
  const publicUrl = url ? `sample-public-link${linkExtension}` : null;

  const onClose = () => {
    setIsOpen(false);
    mockIsClosed();
  };

  return (
    <PublicLinkPopover
      target={target}
      createPublicLink={createPublicLink}
      deletePublicLink={deletePublicLink}
      url={publicUrl}
      isOpen={isOpen}
      onClose={onClose}
      extensions={extensions}
      selectedExtension={extension}
      setSelectedExtension={setExtension}
    />
  );
};

const setup = ({
  hasUUID = true,
  isOpen = true,
  extensions = [],
  isAdmin = false,
}: {
  hasUUID?: boolean;
  isOpen?: boolean;
  extensions?: ExportFormatType[];
  isAdmin?: boolean;
} = {}) => {
  const createPublicLink = jest.fn();
  const deletePublicLink = jest.fn();
  const onClose = jest.fn();

  renderWithProviders(
    <TestComponent
      createPublicLink={createPublicLink}
      deletePublicLink={deletePublicLink}
      isOpen={isOpen}
      onClose={onClose}
      extensions={extensions}
      url={hasUUID ? "sample-public-link" : null}
    />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({
          is_superuser: isAdmin,
        }),
      }),
    },
  );
  return {
    createPublicLink,
    deletePublicLink,
    onClose,
  };
};

describe("PublicLinkPopover", () => {
  describe("when rendering for admins vs non-admins", () => {
    it("should render public link information for admins", async () => {
      setup({ isAdmin: true });

      expect(screen.getByText("Public link")).toBeInTheDocument();
      expect(
        screen.getByText("Anyone can view this if you give them the link."),
      ).toBeInTheDocument();
      expect(
        await screen.findByDisplayValue("sample-public-link"),
      ).toBeInTheDocument();
    });

    it("should render public link information for non-admins", async () => {
      setup({ isAdmin: false });

      expect(screen.getByText("Public link")).toBeInTheDocument();
      expect(
        screen.getByText("Anyone can view this if you give them the link."),
      ).toBeInTheDocument();
      expect(
        await screen.findByDisplayValue("sample-public-link"),
      ).toBeInTheDocument();
    });

    it("should render `Remove public link` and warning tooltip for admins", async () => {
      setup({
        hasUUID: true,
        isOpen: true,
        isAdmin: true,
      });

      await userEvent.hover(screen.getByText("Remove public link"));

      expect(
        await screen.findByText(
          "Affects both public link and embed URL for this dashboard",
        ),
      ).toBeInTheDocument();
    });

    it("should not render `Remove public link` for non-admins", () => {
      setup({ isAdmin: false });

      expect(screen.queryByText("Remove public link")).not.toBeInTheDocument();
    });
  });

  describe("when creating public links", () => {
    it("should call createPublicLink when uuid is null and isOpen is true", () => {
      const { createPublicLink } = setup({ hasUUID: false });

      expect(createPublicLink).toHaveBeenCalledTimes(1);
    });

    it("should not call createPublicLink when isOpen is false", () => {
      const { createPublicLink } = setup({ isOpen: false, hasUUID: false });

      expect(createPublicLink).not.toHaveBeenCalled();
    });

    it("should call createPublicLink when uuid is null and the popover is opened", async () => {
      const { createPublicLink } = setup({ hasUUID: false, isOpen: false });

      await userEvent.click(screen.getByTestId("target"));

      expect(
        await screen.findByTestId("public-link-popover-content"),
      ).toBeInTheDocument();

      expect(createPublicLink).toHaveBeenCalledTimes(1);
    });

    it("should not call createPublicLink when uuid is not null and the popover is opened", async () => {
      const { createPublicLink } = setup({ hasUUID: true, isOpen: false });

      await userEvent.click(screen.getByTestId("target"));

      expect(createPublicLink).not.toHaveBeenCalled();
      expect(
        await screen.findByDisplayValue("sample-public-link"),
      ).toBeInTheDocument();
    });
  });

  describe("when deleting public links", () => {
    it("should call deletePublicLink and onClose when `Remove public link` is clicked", async () => {
      const { deletePublicLink, onClose } = setup({
        hasUUID: true,
        isOpen: true,
        isAdmin: true,
      });

      await userEvent.click(screen.getByText("Remove public link"));

      expect(deletePublicLink).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("when copying the link", () => {
    it("should allow admins to copy the link to the clipboard", async () => {
      setup({ hasUUID: true, isOpen: true });

      expect(
        await screen.findByDisplayValue("sample-public-link"),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByLabelText("copy icon"));

      expect(await screen.findByText("Copied!")).toBeInTheDocument();
    });

    it("should allow non-admins to copy the link to the clipboard", async () => {
      setup({ hasUUID: true, isOpen: true, isAdmin: false });

      expect(
        await screen.findByDisplayValue("sample-public-link"),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByLabelText("copy icon"));

      expect(await screen.findByText("Copied!")).toBeInTheDocument();
    });
  });

  describe("when appending extensions to the link", () => {
    it("should append the extension to the link when the extension is clicked on", async () => {
      setup({ hasUUID: true, isOpen: true, extensions: ["csv"] });

      expect(
        await screen.findByTestId("public-link-popover-content"),
      ).toBeInTheDocument();

      expect(
        await screen.findByDisplayValue("sample-public-link"),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByText("csv"));
      expect(
        screen.getByDisplayValue("sample-public-link.csv"),
      ).toBeInTheDocument();
    });

    it("should remove the extension when the extension is clicked on again", async () => {
      setup({ hasUUID: true, isOpen: true, extensions: ["csv"] });

      expect(
        await screen.findByTestId("public-link-popover-content"),
      ).toBeInTheDocument();

      expect(
        await screen.findByDisplayValue("sample-public-link"),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByText("csv"));
      expect(
        screen.getByDisplayValue("sample-public-link.csv"),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByText("csv"));

      expect(
        await screen.findByDisplayValue("sample-public-link"),
      ).toBeInTheDocument();
    });
  });
});
