import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockDocument, createMockUser } from "metabase-types/api/mocks";

import { DOCUMENT_TITLE_MAX_LENGTH } from "../constants";

import { DocumentHeader } from "./DocumentHeader";

const defaultDocument = createMockDocument({
  creator: createMockUser({ common_name: "John Doe" }),
  updated_at: "2024-01-15T10:30:00Z",
});

const setup = ({
  document = defaultDocument,
  documentTitle = "Test Document",
  isNewDocument = false,
  canWrite = true,
  showSaveButton = false,
  isBookmarked = false,
  isAdmin = false,
  isPublicSharingEnabled = false,
  onTitleChange = jest.fn(),
  onSave = jest.fn(),
  onMove = jest.fn(),
  onDuplicate = jest.fn(),
  onToggleBookmark = jest.fn(),
  onArchive = jest.fn(),
  onShowHistory = jest.fn(),
  onToggleComments = jest.fn(),
} = {}) => {
  const props = {
    document,
    documentTitle,
    isNewDocument,
    canWrite,
    showSaveButton,
    isBookmarked,
    onTitleChange,
    onSave,
    onMove,
    onDuplicate,
    onToggleBookmark,
    onArchive,
    onShowHistory,
    onToggleComments,
  };

  renderWithProviders(<DocumentHeader {...props} />, {
    storeInitialState: {
      currentUser: createMockUser({ is_superuser: isAdmin }),
      settings: {
        values: {
          "enable-public-sharing": isPublicSharingEnabled,
        } as any,
        loading: false,
      },
    },
  });

  return props;
};

describe("DocumentHeader", () => {
  describe("Title input", () => {
    it("should render document title", () => {
      setup({ documentTitle: "My Document" });
      expect(screen.getByDisplayValue("My Document")).toBeInTheDocument();
    });

    it("should enforce maximum title length", async () => {
      const onTitleChange = jest.fn();
      const longTitle = "a".repeat(DOCUMENT_TITLE_MAX_LENGTH + 10);
      setup({ documentTitle: "", onTitleChange });

      const input = screen.getByLabelText("Document Title");
      await userEvent.type(input, longTitle);

      const lastCall =
        onTitleChange.mock.calls[onTitleChange.mock.calls.length - 1];
      expect(lastCall[0].length).toBeLessThanOrEqual(DOCUMENT_TITLE_MAX_LENGTH);
    });

    it("should be read-only when user cannot write", () => {
      setup({ canWrite: false });
      const input = screen.getByLabelText("Document Title");
      expect(input).toHaveAttribute("readonly");
    });

    it("should have autofocus for new documents", () => {
      setup({ isNewDocument: true });
      const input = screen.getByLabelText("Document Title");
      expect(input).toHaveFocus();
    });
  });

  describe("Metadata", () => {
    it("should show creator name and update time for existing documents", () => {
      setup();
      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("January 15, 2024")).toBeInTheDocument();
    });
  });

  describe("Save button", () => {
    it("should show save button when showSaveButton is true", () => {
      setup({ showSaveButton: true });
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    });

    it("should not show save button when showSaveButton is false", () => {
      setup({ showSaveButton: false });
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
    });

    it("should call onSave when save button is clicked", async () => {
      const onSave = jest.fn();
      setup({ showSaveButton: true, onSave });

      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(onSave).toHaveBeenCalled();
    });
  });

  describe("Menu actions", () => {
    it("should show the print option", async () => {
      const originalPrint = window.print;
      window.print = jest.fn();

      setup();

      await userEvent.click(screen.getByLabelText("More options"));
      await userEvent.click(screen.getByText("Print Document"));
      expect(window.print).toHaveBeenCalled();

      window.print = originalPrint;
    });

    it("should show bookmark option", async () => {
      setup({ isNewDocument: false, isBookmarked: false });
      await userEvent.click(screen.getByLabelText("More options"));
      expect(screen.getByText("Bookmark")).toBeInTheDocument();
    });

    it("should show remove bookmark option when bookmarked", async () => {
      setup({ isNewDocument: false, isBookmarked: true });
      await userEvent.click(screen.getByLabelText("More options"));
      expect(screen.getByText("Remove from Bookmarks")).toBeInTheDocument();
    });

    it("should call onToggleBookmark when bookmark is clicked", async () => {
      const onToggleBookmark = jest.fn();
      setup({ isNewDocument: false, onToggleBookmark });

      await userEvent.click(screen.getByLabelText("More options"));
      await userEvent.click(screen.getByText("Bookmark"));
      expect(onToggleBookmark).toHaveBeenCalled();
    });

    it("should show move and archive options when user can write", async () => {
      setup({ isNewDocument: false, canWrite: true });
      await userEvent.click(screen.getByLabelText("More options"));

      expect(screen.getByText("Move")).toBeInTheDocument();
      expect(screen.getByText("Move to trash")).toBeInTheDocument();

      expect(screen.getByText("Duplicate")).toBeInTheDocument();
    });

    it("should not show move and archive options when user cannot write", async () => {
      setup({ isNewDocument: false, canWrite: false });
      await userEvent.click(screen.getByLabelText("More options"));

      expect(screen.queryByText("Move")).not.toBeInTheDocument();
      expect(screen.queryByText("Move to trash")).not.toBeInTheDocument();

      // User can still duplicate the document
      expect(screen.getByText("Duplicate")).toBeInTheDocument();
    });

    it("should call onMove when move is clicked", async () => {
      const onMove = jest.fn();
      setup({ isNewDocument: false, canWrite: true, onMove });

      await userEvent.click(screen.getByLabelText("More options"));
      await userEvent.click(screen.getByText("Move"));
      expect(onMove).toHaveBeenCalled();
    });

    it("should call onArchive when archive is clicked", async () => {
      const onArchive = jest.fn();
      setup({ isNewDocument: false, canWrite: true, onArchive });

      await userEvent.click(screen.getByLabelText("More options"));
      await userEvent.click(screen.getByText("Move to trash"));
      expect(onArchive).toHaveBeenCalled();
    });

    it("should not show saved document options for new documents", async () => {
      setup({ isNewDocument: true });
      await userEvent.click(screen.getByLabelText("More options"));

      expect(screen.queryByText("Move")).not.toBeInTheDocument();
      expect(screen.queryByText("Duplicate")).not.toBeInTheDocument();
      expect(screen.queryByText("Bookmark")).not.toBeInTheDocument();
      expect(screen.queryByText("Move to trash")).not.toBeInTheDocument();
    });

    it("should not be present when document is archived", () => {
      setup({
        document: { ...defaultDocument, archived: true },
      });
      expect(screen.queryByLabelText("More options")).not.toBeInTheDocument();
    });

    it("should call onDuplicate when duplicate is clicked", async () => {
      const onDuplicate = jest.fn();
      setup({
        isNewDocument: false,
        documentTitle: "Test Document",
        onDuplicate,
      });
      await userEvent.click(screen.getByLabelText("More options"));
      await userEvent.click(screen.getByText("Duplicate"));
      expect(onDuplicate).toHaveBeenCalled();
    });
  });
});
