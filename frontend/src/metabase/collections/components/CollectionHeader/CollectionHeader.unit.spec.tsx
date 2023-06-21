import userEvent, { specialChars } from "@testing-library/user-event";
import { getIcon, render, screen } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";
import CollectionHeader, { CollectionHeaderProps } from "./CollectionHeader";

const setup = (options = {}) => {
  render(<CollectionHeader {...getProps({})} {...options} />);
};

describe("CollectionHeader", () => {
  describe("collection name", () => {
    it("should be able to edit name with write access", () => {
      const props = getProps({
        collection: createMockCollection({
          name: "Name",
          can_write: true,
        }),
      });

      render(<CollectionHeader {...props} />);

      const input = screen.getByDisplayValue("Name");
      userEvent.clear(input);
      userEvent.type(input, `New name${specialChars.enter}`);

      expect(props.onUpdateCollection).toHaveBeenCalledWith(props.collection, {
        name: "New name",
      });
    });

    it("should not be able to edit name without write access", () => {
      const props = getProps({
        collection: createMockCollection({
          name: "Name",
          can_write: false,
        }),
      });

      render(<CollectionHeader {...props} />);

      const input = screen.getByDisplayValue("Name");
      expect(input).toBeDisabled();
    });

    it("should not be able to edit name for the root collection", () => {
      const props = getProps({
        collection: createMockCollection({
          id: "root",
          name: "Our analytics",
          can_write: true,
        }),
      });

      render(<CollectionHeader {...props} />);

      const input = screen.getByDisplayValue("Our analytics");
      expect(input).toBeDisabled();
    });

    it("should not be able to edit name for personal collections", () => {
      const props = getProps({
        collection: createMockCollection({
          name: "Personal collection",
          personal_owner_id: 1,
          can_write: true,
        }),
      });

      render(<CollectionHeader {...props} />);

      const input = screen.getByDisplayValue("Personal collection");
      expect(input).toBeDisabled();
    });

    it("should show an icon for instance analytics collections", () => {
      const props = getProps({
        collection: createMockCollection({
          name: "Audit",
          type: "instance-analytics",
        }),
      });

      render(<CollectionHeader {...props} />);

      expect(getIcon("beaker")).toBeInTheDocument();
    });
  });

  describe("collection description", () => {
    it("should be able to edit description with write access", () => {
      const props = getProps({
        collection: createMockCollection({
          description: "Description",
          can_write: true,
        }),
      });

      render(<CollectionHeader {...props} />);

      // show input
      const editableText = screen.getByText("Description");
      userEvent.click(editableText);

      const input = screen.getByDisplayValue("Description");
      userEvent.clear(input);
      userEvent.type(input, "New description");
      userEvent.tab();

      expect(props.onUpdateCollection).toHaveBeenCalledWith(props.collection, {
        description: "New description",
      });
    });

    it("should be able to add description with write access", () => {
      const props = getProps({
        collection: createMockCollection({
          description: null,
          can_write: true,
        }),
      });

      render(<CollectionHeader {...props} />);

      const input = screen.getByPlaceholderText("Add description");
      userEvent.type(input, "New description");
      userEvent.tab();

      expect(props.onUpdateCollection).toHaveBeenCalledWith(props.collection, {
        description: "New description",
      });
    });

    it("should not be able to add description without write access", () => {
      const props = getProps({
        collection: createMockCollection({
          description: null,
          can_write: false,
        }),
      });

      render(<CollectionHeader {...props} />);

      const input = screen.queryByPlaceholderText("Add description");
      expect(input).not.toBeInTheDocument();
    });

    it("should be able to view the description without write access", () => {
      const props = getProps({
        collection: createMockCollection({
          description: "Description",
          can_write: false,
        }),
      });

      render(<CollectionHeader {...props} />);

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
      const props = getProps();

      render(<CollectionHeader {...props} />);

      expect(screen.getByLabelText("calendar icon")).toBeInTheDocument();
    });
  });

  describe("collection bookmark", () => {
    it("should be able to bookmark a collection", () => {
      const props = getProps({
        collection: createMockCollection({
          can_write: false,
        }),
        isBookmarked: false,
      });

      render(<CollectionHeader {...props} />);
      userEvent.click(screen.getByLabelText("bookmark icon"));

      expect(props.onCreateBookmark).toHaveBeenCalledWith(props.collection);
    });

    it("should be able to remove a collection from bookmarks", () => {
      const props = getProps({
        collection: createMockCollection({
          can_write: false,
        }),
        isBookmarked: true,
      });

      render(<CollectionHeader {...props} />);
      userEvent.click(screen.getByLabelText("bookmark icon"));

      expect(props.onDeleteBookmark).toHaveBeenCalledWith(props.collection);
    });
  });

  describe("collection permissions", () => {
    it("should be able to edit collection permissions with admin access", () => {
      const props = getProps({
        collection: createMockCollection({
          can_write: true,
        }),
        isAdmin: true,
      });

      render(<CollectionHeader {...props} />);
      userEvent.click(screen.getByLabelText("ellipsis icon"));

      expect(screen.getByText("Edit permissions")).toBeInTheDocument();
    });

    it("should not be able to edit collection permissions without admin access", () => {
      const props = getProps({
        collection: createMockCollection({
          can_write: true,
        }),
        isAdmin: false,
      });

      render(<CollectionHeader {...props} />);
      userEvent.click(screen.getByLabelText("ellipsis icon"));

      expect(screen.queryByText("Edit permissions")).not.toBeInTheDocument();
    });

    it("should not be able to edit permissions for personal collections", () => {
      const props = getProps({
        collection: createMockCollection({
          personal_owner_id: 1,
          can_write: true,
        }),
        isAdmin: true,
      });

      render(<CollectionHeader {...props} />);

      expect(screen.queryByLabelText("ellipsis icon")).not.toBeInTheDocument();
    });

    it("should not be able to edit permissions for personal subcollections", () => {
      const props = getProps({
        collection: createMockCollection({
          can_write: true,
        }),
        isAdmin: true,
        isPersonalCollectionChild: true,
      });

      render(<CollectionHeader {...props} />);
      userEvent.click(screen.getByLabelText("ellipsis icon"));

      expect(screen.queryByText("Edit permissions")).not.toBeInTheDocument();
    });
  });

  describe("moving and arching collections", () => {
    it("should be able to move and archive a collection with write access", () => {
      const props = getProps({
        collection: createMockCollection({
          can_write: true,
        }),
      });

      render(<CollectionHeader {...props} />);
      userEvent.click(screen.getByLabelText("ellipsis icon"));

      expect(screen.getByText("Move")).toBeInTheDocument();
      expect(screen.getByText("Archive")).toBeInTheDocument();
    });

    it("should not be able to move and archive a collection without write access", () => {
      const props = getProps({
        collection: createMockCollection({
          can_write: false,
        }),
      });

      render(<CollectionHeader {...props} />);

      expect(screen.queryByLabelText("ellipsis icon")).not.toBeInTheDocument();
    });

    it("should not be able to move and archive the root collection", () => {
      const props = getProps({
        collection: createMockCollection({
          id: "root",
          name: "Our analytics",
          can_write: true,
        }),
      });

      render(<CollectionHeader {...props} />);

      expect(screen.queryByLabelText("ellipsis icon")).not.toBeInTheDocument();
    });

    it("should not be able to move and archive personal collections", () => {
      const props = getProps({
        collection: createMockCollection({
          personal_owner_id: 1,
          can_write: true,
        }),
      });

      render(<CollectionHeader {...props} />);

      expect(screen.queryByLabelText("ellipsis icon")).not.toBeInTheDocument();
    });
  });

  describe("uploads", () => {
    it("should show the upload button if uploads are enabled and the user has write permissions", () => {
      setup({
        collection: createMockCollection({ can_write: true }),
        uploadsEnabled: true,
        canUpload: true,
        isAdmin: false,
      });

      expect(screen.getByLabelText("Upload data")).toBeInTheDocument();
    });

    it("should show the upload button if uploads are disabled and the user has write permissions", () => {
      setup({
        collection: createMockCollection({ can_write: true }),
        uploadsEnabled: false,
        canUpload: true,
        isAdmin: false,
      });

      expect(screen.getByLabelText("Upload data")).toBeInTheDocument();
    });

    it("should not show the upload button if the user lacks write permissions on the collection", () => {
      setup({
        collection: createMockCollection({ can_write: false }),
        uploadsEnabled: true,
        canUpload: true,
        isAdmin: false,
      });

      expect(screen.queryByLabelText("Upload data")).not.toBeInTheDocument();
    });

    it("should show an informational modal when clicking the upload button when uploads are disabled", async () => {
      setup({
        collection: createMockCollection({ can_write: true }),
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
        collection: createMockCollection({ can_write: true }),
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
        collection: createMockCollection({ can_write: true }),
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
        collection: createMockCollection({ can_write: true }),
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
        collection: createMockCollection({ can_write: true }),
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

const getProps = (
  opts?: Partial<CollectionHeaderProps>,
): CollectionHeaderProps => ({
  collection: createMockCollection(),
  isAdmin: false,
  isBookmarked: false,
  canUpload: false,
  uploadsEnabled: true,
  isPersonalCollectionChild: false,
  onUpdateCollection: jest.fn(),
  onCreateBookmark: jest.fn(),
  onUpload: jest.fn(),
  onDeleteBookmark: jest.fn(),
  location: {
    pathname: `/collection/1`,
    search: "",
    query: {},
    hash: "",
    state: {},
    action: "PUSH",
    key: "1",
  },
  ...opts,
});
