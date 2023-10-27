import userEvent, { specialChars } from "@testing-library/user-event";
import { getIcon, screen } from "__support__/ui";

import type { CollectionId } from "metabase-types/api";
import { setup } from "./setup";

describe("CollectionHeader", () => {
  describe("collection name", () => {
    it("should be able to edit name with write access", () => {
      const collection = {
        name: "Name",
        can_write: true,
      };

      const { onUpdateCollection, collection: myCollection } = setup({
        collection,
      });

      const input = screen.getByDisplayValue("Name");
      userEvent.clear(input);
      userEvent.type(input, `New name${specialChars.enter}`);

      expect(onUpdateCollection).toHaveBeenCalledWith(myCollection, {
        name: "New name",
      });
    });

    it("should not be able to edit name without write access", () => {
      const collection = {
        name: "Name",
        can_write: false,
      };

      setup({ collection });

      const input = screen.getByDisplayValue("Name");
      expect(input).toBeDisabled();
    });

    it("should not be able to edit name for the root collection", () => {
      const collection = {
        id: "root" as CollectionId,
        name: "Our analytics",
        can_write: true,
      };

      setup({ collection });

      const input = screen.getByDisplayValue("Our analytics");
      expect(input).toBeDisabled();
    });

    it("should not be able to edit name for personal collections", () => {
      const collection = {
        name: "Personal collection",
        personal_owner_id: 1,
        can_write: true,
      };

      setup({ collection });

      const input = screen.getByDisplayValue("Personal collection");
      expect(input).toBeDisabled();
    });
  });

  describe("collection description", () => {
    it("should be able to edit description with write access", () => {
      const collection = {
        description: "Description",
        can_write: true,
      };

      const { onUpdateCollection, collection: myCollection } = setup({
        collection,
      });

      // show input
      const editableText = screen.getByText("Description");
      userEvent.click(editableText);

      const input = screen.getByDisplayValue("Description");
      userEvent.clear(input);
      userEvent.type(input, "New description");
      userEvent.tab();

      expect(onUpdateCollection).toHaveBeenCalledWith(myCollection, {
        description: "New description",
      });
    });

    it("should be able to add description with write access", () => {
      const collection = {
        description: null,
        can_write: true,
      };

      const { onUpdateCollection, collection: myCollection } = setup({
        collection,
      });

      const input = screen.getByPlaceholderText("Add description");
      userEvent.type(input, "New description");
      userEvent.tab();

      expect(onUpdateCollection).toHaveBeenCalledWith(myCollection, {
        description: "New description",
      });
    });

    it("should not be able to add description without write access", () => {
      const collection = {
        description: null,
        can_write: false,
      };

      setup({ collection });

      const input = screen.queryByPlaceholderText("Add description");
      expect(input).not.toBeInTheDocument();
    });

    it("should be able to view the description without write access", () => {
      const collection = {
        description: "Description",
        can_write: false,
      };

      setup({ collection });

      // show input
      const editableText = screen.getByText("Description");
      userEvent.click(editableText);

      const input = screen.getByDisplayValue("Description");
      expect(input).toBeInTheDocument();
      expect(input).toBeDisabled();
    });
  });

  describe("collection timelines", () => {
    it("should have a link to collection timelines", () => {
      setup();

      expect(screen.getByLabelText("calendar icon")).toBeInTheDocument();
    });
  });

  describe("collection bookmark", () => {
    it("should be able to bookmark a collection", () => {
      const collection = {
        can_write: false,
      };

      const { onCreateBookmark, collection: myCollection } = setup({
        collection,
        isBookmarked: false,
      });
      userEvent.click(screen.getByLabelText("bookmark icon"));

      expect(onCreateBookmark).toHaveBeenCalledWith(myCollection);
    });

    it("should be able to remove a collection from bookmarks", () => {
      const collection = {
        can_write: false,
      };

      const { onDeleteBookmark, collection: myCollection } = setup({
        collection,
        isBookmarked: true,
      });
      userEvent.click(screen.getByLabelText("bookmark icon"));

      expect(onDeleteBookmark).toHaveBeenCalledWith(myCollection);
    });
  });

  describe("collection menu", () => {
    it("should have collection menu options", () => {
      const collection = { can_write: true };
      setup({ collection });

      userEvent.click(screen.getByLabelText("ellipsis icon"));
      expect(screen.getByText("Move")).toBeInTheDocument();
      expect(screen.getByText("Archive")).toBeInTheDocument();
    });
  });

  describe("uploads", () => {
    it("should show the upload button if uploads are enabled and the user has write permissions", () => {
      setup({
        collection: { can_write: true },
        uploadsEnabled: true,
        canUpload: true,
        isAdmin: false,
      });

      expect(screen.getByLabelText("Upload data")).toBeInTheDocument();
    });

    it("should show the upload button if uploads are disabled and the user has write permissions", () => {
      setup({
        collection: { can_write: true },
        uploadsEnabled: false,
        canUpload: true,
        isAdmin: false,
      });

      expect(screen.getByLabelText("Upload data")).toBeInTheDocument();
    });

    it("should not show the upload button if the user lacks write permissions on the collection", () => {
      setup({
        collection: { can_write: false },
        uploadsEnabled: true,
        canUpload: true,
        isAdmin: false,
      });

      expect(screen.queryByLabelText("Upload data")).not.toBeInTheDocument();
    });

    it("should show an informational modal when clicking the upload button when uploads are disabled", async () => {
      setup({
        collection: { can_write: true },
        uploadsEnabled: false,
        canUpload: true,
        isAdmin: false,
      });
      userEvent.click(screen.getByLabelText("Upload data"));

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Uploads CSVs to Metabase")).toBeInTheDocument();
    });

    it("should show an informational modal with a link to settings for admins", async () => {
      setup({
        collection: { can_write: true },
        uploadsEnabled: false,
        canUpload: true,
        isAdmin: true,
      });
      userEvent.click(screen.getByLabelText("Upload data"));

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Enable in settings")).toBeInTheDocument();
      expect(screen.getByRole("link")).toBeInTheDocument();
    });

    it("should show an informational modal without a link for non-admins", async () => {
      setup({
        collection: { can_write: true },
        uploadsEnabled: false,
        canUpload: true,
        isAdmin: false,
      });
      userEvent.click(screen.getByLabelText("Upload data"));

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText(/ask your admin to enable/i)).toBeInTheDocument();
    });

    it("should be able to close the admin upload info modal", async () => {
      setup({
        collection: { can_write: true },
        uploadsEnabled: false,
        canUpload: true,
        isAdmin: true,
      });
      userEvent.click(screen.getByLabelText("Upload data"));

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      userEvent.click(getIcon("close"));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("should be able to close the non-admin upload info modal", async () => {
      setup({
        collection: { can_write: true },
        uploadsEnabled: false,
        canUpload: true,
        isAdmin: false,
      });
      userEvent.click(screen.getByLabelText("Upload data"));

      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      userEvent.click(screen.getByText("Got it"));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
