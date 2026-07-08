import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupUpdateCollectionEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import { ArchiveCollectionModal } from "./ArchiveCollectionModal";

const TEST_COLLECTION = createMockCollection({ id: 1, name: "Sales" });

const setup = ({
  slug = "1-sales",
  onClose = jest.fn(),
  withUndos = false,
}: {
  slug?: string;
  onClose?: () => void;
  withUndos?: boolean;
} = {}) => {
  const props = {
    onClose,
    params: { slug },
  };

  renderWithProviders(<ArchiveCollectionModal {...props} />, {
    withUndos,
  });

  return { onClose };
};

describe("ArchiveCollectionModal", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  it("shows the archive button loading state while archiving", async () => {
    setupCollectionByIdEndpoint({ collections: [TEST_COLLECTION] });
    let resolveArchive: (collection: typeof TEST_COLLECTION) => void =
      jest.fn();
    fetchMock.put(
      "path:/api/collection/1",
      () =>
        new Promise((resolve) => {
          resolveArchive = resolve;
        }),
    );

    const { onClose } = setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "Move to trash" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/collection/1", {
          method: "PUT",
        }),
      ).toHaveLength(1);
    });

    expect(
      screen.getByRole("button", { name: "Move to trash" }),
    ).toHaveAttribute("data-loading", "true");

    resolveArchive(TEST_COLLECTION);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("shows an error message when archiving fails (#75180)", async () => {
    jest.spyOn(console, "error").mockReturnValue();
    setupCollectionByIdEndpoint({ collections: [TEST_COLLECTION] });
    fetchMock.put("path:/api/collection/1", 503);

    const { onClose } = setup({ withUndos: true });

    await userEvent.click(
      await screen.findByRole("button", { name: "Move to trash" }),
    );

    expect(
      await screen.findByText("Collection could not be archived."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Move this collection to trash?"),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText("Trashed collection")).not.toBeInTheDocument();
  });
});
