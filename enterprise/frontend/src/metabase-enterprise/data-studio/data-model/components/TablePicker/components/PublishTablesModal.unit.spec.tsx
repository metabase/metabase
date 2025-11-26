import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupRecentViewsEndpoints,
  setupUserAcknowledgementEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { createMockCollection } from "metabase-types/api/mocks";

import { PublishTablesModal } from "./PublishTablesModal";

function setup(
  args: {
    isOpen?: boolean;
    tables?: Set<number | string>;
    schemas?: Set<string>;
    databases?: Set<number>;
    seenPublishTablesInfo?: boolean;
    publishError?: boolean;
  } = {},
) {
  const {
    isOpen = true,
    tables = new Set([1]),
    schemas = new Set<string>(),
    databases = new Set<number>(),
    seenPublishTablesInfo = true,
    publishError = false,
  } = args;

  const onClose = jest.fn();
  const onSuccess = jest.fn();

  setupUserAcknowledgementEndpoints({
    key: "seen-publish-tables-info",
    value: seenPublishTablesInfo,
  });
  setupRecentViewsEndpoints([]);
  const testCollection = createMockCollection({
    id: 1,
    name: "Test Collection",
  });
  setupCollectionsEndpoints({
    collections: [testCollection],
  });
  setupRecentViewsAndSelectionsEndpoints([]);
  setupCollectionByIdEndpoint({ collections: [testCollection] });
  setupCollectionItemsEndpoint({
    collection: createMockCollection({ id: "root" }),
    collectionItems: [],
  });
  setupCollectionItemsEndpoint({
    collection: testCollection,
    collectionItems: [],
  });

  // Setup publish tables API endpoint
  if (publishError) {
    fetchMock.post("path:/api/ee/data-studio/table/publish-table", {
      status: 500,
      body: { message: "Failed to publish" },
    });
  } else {
    fetchMock.post("path:/api/ee/data-studio/table/publish-table", 200);
  }

  mockGetBoundingClientRect();

  renderWithProviders(
    <>
      <PublishTablesModal
        isOpen={isOpen}
        tables={tables}
        schemas={schemas}
        databases={databases}
        onClose={onClose}
        onSuccess={onSuccess}
      />
      <UndoListing />
    </>,
    {
      withRouter: false,
    },
  );

  return {
    onClose,
    onSuccess,
  };
}

function getCheckbox() {
  return screen.getByRole("checkbox", {
    name: "Don’t show this to me again",
  });
}

describe("PublishTablesModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders nothing when isOpen is false", () => {
    setup({ isOpen: false });

    expect(
      screen.queryByText("Pick the collection to publish this table in"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("What publishing a table does"),
    ).not.toBeInTheDocument();
  });

  it("renders collection picker when user has seen publish tables info", async () => {
    setup({ seenPublishTablesInfo: true });

    await waitFor(() => {
      expect(
        screen.getByText("Pick the collection to publish this table in"),
      ).toBeInTheDocument();
    });
  });

  it("calls onClose when closing info modal", async () => {
    const { onClose } = setup({ seenPublishTablesInfo: false });

    const closeButton = screen.getByRole("button", { name: /close/i });
    await userEvent.click(closeButton);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("calls onClose when closing collection picker", async () => {
    const { onClose } = setup({ seenPublishTablesInfo: true });

    await waitFor(() => {
      expect(
        screen.getByText("Pick the collection to publish this table in"),
      ).toBeInTheDocument();
    });

    const closeButton = screen.getByRole("button", { name: /close/i });
    await userEvent.click(closeButton);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("handles success flow correctly", async () => {
    const { onSuccess } = setup({
      seenPublishTablesInfo: false,
      tables: new Set([1, 2]),
      schemas: new Set<string>(["10"]),
      databases: new Set([100]),
    });

    const checkbox = getCheckbox();
    await userEvent.click(checkbox);

    const gotItButton = screen.getByRole("button", { name: "Got it" });
    await userEvent.click(gotItButton);

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "path:/api/user-key-value/namespace/user_acknowledgement/key/seen-publish-tables-info",
          { method: "PUT" },
        ),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(
        screen.getByText("Pick the collection to publish this table in"),
      ).toBeInTheDocument();
    });

    // Select a collection and confirm
    const collectionLink = await screen.findByText("Test Collection");
    await userEvent.click(collectionLink);

    const publishButton = await screen.findByRole("button", {
      name: "Publish here",
    });
    await userEvent.click(publishButton);

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/data-studio/table/publish-table",
        ),
      ).toBe(true);
    });

    const lastCall = fetchMock.callHistory.lastCall(
      "path:/api/ee/data-studio/table/publish-table",
    );
    expect(lastCall).toBeTruthy();
    const body = lastCall?.options?.body;
    expect(body).toBeTruthy();
    const parsedBody = typeof body === "string" ? JSON.parse(body) : body;
    expect(parsedBody.table_ids).toEqual([1, 2]);
    expect(parsedBody.schema_ids).toEqual(["10"]);
    expect(parsedBody.database_ids).toEqual([100]);
    expect(parsedBody.target_collection_id).toBe(1);

    // make sure we call onSuccess
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });

    // make sure we show the success toast
    await waitFor(() => {
      expect(screen.getByText(/Published/i)).toBeInTheDocument();
    });
  });

  it("shows error toast when publishTables API fails", async () => {
    setup({
      seenPublishTablesInfo: true,
      publishError: true,
    });

    await waitFor(() => {
      expect(
        screen.getByText("Pick the collection to publish this table in"),
      ).toBeInTheDocument();
    });

    const collectionLink = await screen.findByText("Test Collection");
    await userEvent.click(collectionLink);

    const publishButton = await screen.findByRole("button", {
      name: "Publish here",
    });
    await userEvent.click(publishButton);

    await waitFor(() => {
      expect(screen.getByText(/Failed to publish tables/i)).toBeInTheDocument();
    });
  });

  it("handles root collection selection correctly", async () => {
    setup({
      seenPublishTablesInfo: true,
    });

    await waitFor(() => {
      expect(
        screen.getByText("Pick the collection to publish this table in"),
      ).toBeInTheDocument();
    });

    const rootCollectionLink = await screen.findByText(/Our Analytics/i);
    await userEvent.click(rootCollectionLink);

    const publishButton = await screen.findByRole("button", {
      name: "Publish here",
    });
    await userEvent.click(publishButton);

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/data-studio/table/publish-table",
        ),
      ).toBe(true);
    });

    const lastCall = fetchMock.callHistory.lastCall(
      "path:/api/ee/data-studio/table/publish-table",
    );
    expect(lastCall).toBeTruthy();
    const body = lastCall?.options?.body;
    expect(body).toBeTruthy();
    const parsedBody = typeof body === "string" ? JSON.parse(body) : body;
    expect(parsedBody.target_collection_id).toBeNull();
  });
});
