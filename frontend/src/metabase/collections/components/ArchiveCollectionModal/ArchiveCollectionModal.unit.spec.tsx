import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupUpdateCollectionEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import { ArchiveCollectionModalContainer } from "./ArchiveCollectionModal";

const TEST_COLLECTION = createMockCollection({ id: 1, name: "Sales" });

const setup = ({
  slug = "1-sales",
  onClose = jest.fn(),
}: {
  slug?: string;
  onClose?: () => void;
} = {}) => {
  const props = {
    onClose,
    params: { slug },
  };

  renderWithProviders(<ArchiveCollectionModalContainer {...props} />);

  return { onClose };
};

describe("ArchiveCollectionModal", () => {
  it("fetches the collection from the slug and renders the archive modal", async () => {
    setupCollectionByIdEndpoint({ collections: [TEST_COLLECTION] });

    setup();

    expect(
      await screen.findByText("Move this collection to trash?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The dashboards, collections, and alerts in this collection will also be moved to the trash.",
      ),
    ).toBeInTheDocument();
  });

  it("does not render the modal before the collection has loaded", () => {
    setupCollectionByIdEndpoint({ collections: [TEST_COLLECTION] });

    setup();

    expect(
      screen.queryByText("Move this collection to trash?"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when the slug has no id", () => {
    setup({ slug: "" });

    expect(
      screen.queryByText("Move this collection to trash?"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when the collection cannot be found", async () => {
    setupCollectionByIdEndpoint({ collections: [] });

    setup();

    await waitFor(() => {
      expect(fetchMock.callHistory.calls().length).toBeGreaterThan(0);
    });

    expect(
      screen.queryByText("Move this collection to trash?"),
    ).not.toBeInTheDocument();
  });

  it("archives the collection and closes when confirmed", async () => {
    setupCollectionByIdEndpoint({ collections: [TEST_COLLECTION] });
    setupUpdateCollectionEndpoint(TEST_COLLECTION);

    const { onClose } = setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "Move to trash" }),
    );

    const findArchiveCall = () =>
      fetchMock.callHistory
        .calls()
        .find(
          (call) =>
            call.options?.method === "PUT" &&
            call.url.endsWith("/api/collection/1"),
        );

    await waitFor(() => {
      expect(findArchiveCall()).toBeTruthy();
    });

    expect(JSON.parse(findArchiveCall()?.options?.body as string)).toEqual({
      archived: true,
    });

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
