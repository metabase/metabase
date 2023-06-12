import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { getIcon, renderWithProviders, screen, waitFor } from "__support__/ui";

import PinnedItemCard from "./PinnedItemCard";

const mockOnCopy = jest.fn();
const mockOnMove = jest.fn();

const defaultCollection = {
  can_write: true,
  id: 1,
  name: "Collection Foo",
  archived: false,
};

const HEADING_1_TEXT = "Heading 1";
const HEADING_1_MARKDOWN = `# ${HEADING_1_TEXT}`;
const HEADING_2_TEXT = "Heading 2";
const HEADING_2_MARKDOWN = `## ${HEADING_2_TEXT}`;
const PARAGRAPH_TEXT = "Paragraph with link";
const PARAGRAPH_MARKDOWN = "Paragraph with [link](https://example.com)";
const MARKDOWN = [
  HEADING_1_MARKDOWN,
  HEADING_2_MARKDOWN,
  PARAGRAPH_MARKDOWN,
].join("\n\n");
const MARKDOWN_AS_TEXT = [HEADING_1_TEXT, HEADING_2_TEXT, PARAGRAPH_TEXT].join(
  " ",
);
const HEADING_SHORT_TEXT = "Short description";
const HEADING_SHORT_MARKDOWN = `# ${HEADING_SHORT_TEXT}`;
const HEADING_LONG_TEXT =
  "This is a very long description that will require visual truncation in the user interface";
const HEADING_LONG_MARKDOWN = `# ${HEADING_LONG_TEXT}`;

function getCollectionItem({
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
} = {}) {
  return {
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
  };
}

const defaultItem = getCollectionItem();

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
    setup({ item: getCollectionItem({ description: null }) });
    expect(screen.getByText("A dashboard")).toBeInTheDocument();
  });

  it("should show an action menu when user clicks on the menu icon in the card", () => {
    setup();
    userEvent.click(getIcon("ellipsis"));
    expect(screen.getByText("Unpin")).toBeInTheDocument();
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
    it("should show only the first line of description without markdown formatting", () => {
      setup({ item: getCollectionItem({ description: MARKDOWN }) });

      expect(screen.getByText(HEADING_1_TEXT)).toBeInTheDocument();
      expect(screen.queryByText(HEADING_1_MARKDOWN)).not.toBeInTheDocument();
      expect(screen.queryByText(HEADING_2_MARKDOWN)).not.toBeInTheDocument();
      expect(screen.queryByText(HEADING_2_TEXT)).not.toBeInTheDocument();
      expect(screen.queryByText(PARAGRAPH_MARKDOWN)).not.toBeInTheDocument();
      expect(screen.queryByText(PARAGRAPH_TEXT)).not.toBeInTheDocument();
    });

    it("should show description tooltip with markdown formatting", () => {
      setup({ item: getCollectionItem({ description: MARKDOWN }) });

      userEvent.hover(screen.getByText(HEADING_1_TEXT));

      const tooltip = screen.getByRole("tooltip");

      expect(tooltip).not.toHaveTextContent(MARKDOWN);
      expect(tooltip).not.toHaveTextContent(HEADING_1_MARKDOWN);
      expect(tooltip).not.toHaveTextContent(HEADING_2_MARKDOWN);
      expect(tooltip).toHaveTextContent(MARKDOWN_AS_TEXT);
    });

    it("should not show description tooltip when ellipis is not necessary", async () => {
      setup({
        item: getCollectionItem({ description: HEADING_SHORT_MARKDOWN }),
      });

      userEvent.hover(screen.getByText(HEADING_SHORT_TEXT));

      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    describe("ellipsis", () => {
      // mocking scrollWidth to simulate ellipsis
      const originalScrollWidth = Object.getOwnPropertyDescriptor(
        Element.prototype,
        "scrollWidth",
      );

      beforeAll(() => {
        Object.defineProperty(Element.prototype, "scrollWidth", {
          configurable: true,
          get() {
            if (this.textContent === HEADING_LONG_TEXT) {
              return 1;
            }

            return 0;
          },
        });
      });

      afterAll(() => {
        Object.defineProperty(
          Element.prototype,
          "scrollWidth",
          originalScrollWidth,
        );
      });

      it("should show description tooltip when ellipis is necessary", async () => {
        setup({
          item: getCollectionItem({ description: HEADING_LONG_MARKDOWN }),
        });

        userEvent.hover(screen.getByText(HEADING_LONG_TEXT));

        await waitFor(() => {
          expect(screen.getByRole("tooltip")).toBeInTheDocument();
        });

        const tooltip = screen.getByRole("tooltip");

        expect(tooltip).toHaveAttribute("data-state", "visible");
        expect(tooltip).not.toHaveTextContent(HEADING_LONG_MARKDOWN);
        expect(tooltip).toHaveTextContent(HEADING_LONG_TEXT);
      });
    });
  });
});
