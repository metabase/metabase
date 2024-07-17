import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { getIcon, renderWithProviders, screen } from "__support__/ui";
import type { IconName } from "metabase/ui";
import type { CollectionItem, CollectionItemModel } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import PinnedItemCard from "./PinnedItemCard";

const mockOnCopy = jest.fn();
const mockOnMove = jest.fn();

const defaultCollection = createMockCollection({
  can_write: true,
  id: 1,
  name: "Collection Foo",
  archived: false,
});

const HEADING_1_TEXT = "Heading 1";
const HEADING_1_MARKDOWN = `# ${HEADING_1_TEXT}`;
const HEADING_2_TEXT = "Heading 2";
const HEADING_2_MARKDOWN = `## ${HEADING_2_TEXT}`;
const PARAGRAPH_TEXT = "Paragraph with link";
const PARAGRAPH_MARKDOWN = "Paragraph with [link](https://example.com)";
const IMAGE_MARKDOWN = "![alt](https://example.com/img.jpg)";
const MARKDOWN = [
  IMAGE_MARKDOWN,
  HEADING_1_MARKDOWN,
  HEADING_2_MARKDOWN,
  PARAGRAPH_MARKDOWN,
].join("\n\n");
const MARKDOWN_AS_TEXT = [HEADING_1_TEXT, HEADING_2_TEXT, PARAGRAPH_TEXT].join(
  " ",
);

const getCollectionItem = ({
  id = 1,
  model = "dashboard",
  name = "My Item",
  description = "description foo foo foo",
  collection_position = 1,
  icon = "dashboard",
  url = "/dashboard/1",
  setArchived = jest.fn(),
  setPinned = jest.fn(),
  ...rest
}: {
  id?: number;
  model?: CollectionItemModel;
  name?: string;
  description?: string;
  collection_position?: number;
  icon?: IconName;
  url?: string;
  setArchived?: (isArchived: boolean) => void;
  setPinned?: (isPinned: boolean) => void;
} = {}): CollectionItem & { description: string } => {
  return createMockCollectionItem({
    ...rest,
    id,
    model,
    name,
    description,
    collection_position,
    getIcon: () => ({ name: icon }),
    getUrl: () => url,
    setArchived,
    setPinned,
  }) as CollectionItem & { description: string };
};

const defaultItem: CollectionItem & { description: string } =
  getCollectionItem();

function setup({ item = defaultItem, collection = defaultCollection } = {}) {
  mockOnCopy.mockReset();
  mockOnMove.mockReset();
  return renderWithProviders(
    <Route
      path="/"
      component={() => (
        <PinnedItemCard
          item={item}
          collection={collection}
          onCopy={mockOnCopy}
          onMove={mockOnMove}
          createBookmark={jest.fn()}
          deleteBookmark={jest.fn()}
        />
      )}
    />,
    { withRouter: true },
  );
}

describe("PinnedItemCard", () => {
  it("should show the item's icon", () => {
    setup();
    expect(getIcon(defaultItem.getIcon().name)).toBeInTheDocument();
  });

  it("should show the item's name", () => {
    setup();
    expect(screen.getByText(defaultItem.name)).toBeInTheDocument();
  });

  it("should show the item's description", () => {
    setup();
    expect(screen.getByText(defaultItem.description)).toBeInTheDocument();
  });

  it("should show a default description if there is no item description", () => {
    setup({ item: getCollectionItem({ description: "" }) });
    expect(screen.getByText("A dashboard")).toBeInTheDocument();
  });

  it("should show an action menu when user clicks on the menu icon in the card", async () => {
    setup();
    await userEvent.click(getIcon("ellipsis"));
    expect(await screen.findByText("Unpin")).toBeInTheDocument();
  });

  it("doesn't show model detail page link", () => {
    setup();
    expect(screen.queryByTestId("model-detail-link")).not.toBeInTheDocument();
  });

  describe("models", () => {
    const model = getCollectionItem({
      id: 1,
      name: "Order",
      model: "dataset",
      url: "/model/1",
    });

    it("should show a model detail page link", () => {
      setup({ item: model });
      expect(screen.getByTestId("model-detail-link")).toBeInTheDocument();
      expect(screen.getByTestId("model-detail-link")).toHaveAttribute(
        "href",
        "/model/1-order/detail",
      );
    });
  });

  describe("description", () => {
    const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    const rangeGetBoundingClientRect = Range.prototype.getBoundingClientRect;

    beforeAll(() => {
      // Mock return values so that getIsTruncated can kick in
      HTMLElement.prototype.getBoundingClientRect = jest
        .fn()
        .mockReturnValue({ height: 1, width: 1 });
      Range.prototype.getBoundingClientRect = jest
        .fn()
        .mockReturnValue({ height: 1, width: 2 });
    });

    afterAll(() => {
      HTMLElement.prototype.getBoundingClientRect = getBoundingClientRect;
      Range.prototype.getBoundingClientRect = rangeGetBoundingClientRect;

      jest.resetAllMocks();
    });

    it("should render description markdown as plain text", () => {
      setup({ item: getCollectionItem({ description: MARKDOWN }) });

      expect(screen.getByText(MARKDOWN_AS_TEXT)).toBeInTheDocument();
    });

    it("should show description tooltip with markdown formatting on hover", async () => {
      setup({ item: getCollectionItem({ description: MARKDOWN }) });

      await userEvent.hover(screen.getByText(MARKDOWN_AS_TEXT));

      expect(screen.getByRole("tooltip")).toHaveTextContent(MARKDOWN_AS_TEXT);
    });
  });
});
