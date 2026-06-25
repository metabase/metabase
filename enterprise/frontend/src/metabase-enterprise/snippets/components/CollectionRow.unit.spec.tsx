import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import { CollectionRow } from "./CollectionRow";

const COLLECTION_NAME = "My snippets folder";

const setup = ({
  archived = false,
  setSnippetCollectionId = jest.fn(),
}: {
  archived?: boolean;
  setSnippetCollectionId?: (id: number | string) => void;
} = {}) => {
  const collection = createMockCollection({
    id: 7,
    name: COLLECTION_NAME,
    archived,
    can_write: true,
  });

  renderWithProviders(
    <CollectionRow
      item={collection}
      setSnippetCollectionId={setSnippetCollectionId}
    />,
  );

  return { setSnippetCollectionId };
};

describe("CollectionRow", () => {
  it("renders the collection name", () => {
    setup();

    expect(screen.getByText(COLLECTION_NAME)).toBeInTheDocument();
  });

  it("selects the collection when clicked", async () => {
    const { setSnippetCollectionId } = setup();

    await userEvent.click(screen.getByText(COLLECTION_NAME));

    expect(setSnippetCollectionId).toHaveBeenCalledWith(7);
  });

  it("is not clickable when the collection is archived", async () => {
    const { setSnippetCollectionId } = setup({ archived: true });

    await userEvent.click(screen.getByText(COLLECTION_NAME));

    expect(setSnippetCollectionId).not.toHaveBeenCalled();
  });
});
