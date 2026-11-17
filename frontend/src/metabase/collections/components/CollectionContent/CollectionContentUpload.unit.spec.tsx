import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { isEqual } from "underscore";

import {
  setupBookmarksEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupNullGetUserKeyValueEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { createMockSettingsState, createMockState } from "__support__/state";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { collectionApi } from "metabase/api";
import { Route } from "metabase/router";
import { FileUploadStatus } from "metabase/status/components/FileUploadStatus/FileUploadStatus";
import type { Collection, CollectionId } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
  createMockLastEditInfo,
  createMockTable,
} from "metabase-types/api/mocks";

import { CollectionContent } from "./CollectionContent";

const firstCollectionId = 1;
const firstCollection = createMockCollection({
  id: firstCollectionId,
  can_write: true,
});

const secondCollectionId = 2;
const secondCollection = createMockCollection({
  id: secondCollectionId,
  name: "Second Collection",
});

const thirdCollection = createMockCollection({
  id: 3,
  name: "Second Collection",
});

const uploadedModel = createMockCollectionItem({
  id: 3,
  name: "my uploaded model",
  collection: secondCollection,
  model: "dataset",
  based_on_upload: 123,
});

const uploadedModel2 = createMockCollectionItem({
  id: 4,
  name: "my second uploaded model",
  collection: secondCollection,
  model: "dataset",
  based_on_upload: 124,
});

const multipleModelsCollection = createMockCollection({
  id: 4,
  name: "Uploads Collection",
});

// Listed in an order where the default (most recently edited) model is neither
// the first nor the last item, and the model picked below is neither the default
// nor the first item.
const multipleUploadedModels = [
  createMockCollectionItem({
    id: 11,
    name: "Dog Breeds",
    model: "dataset",
    based_on_upload: 201,
    "last-edit-info": createMockLastEditInfo({
      timestamp: "2024-01-01T00:00:00Z",
    }),
  }),
  createMockCollectionItem({
    id: 12,
    name: "Star Wars Characters",
    model: "dataset",
    based_on_upload: 202,
    "last-edit-info": createMockLastEditInfo({
      timestamp: "2024-03-01T00:00:00Z",
    }),
  }),
  createMockCollectionItem({
    id: 13,
    name: "Cat Breeds",
    model: "dataset",
    based_on_upload: 203,
    "last-edit-info": createMockLastEditInfo({
      timestamp: "2024-02-01T00:00:00Z",
    }),
  }),
];

async function setupCollectionContent({
  canUpload = true,
  ...overrides
}: { canUpload?: boolean; collectionId?: CollectionId } = {}) {
  setupUserMetabotPermissionsEndpoint();
  setupDatabasesEndpoints([createMockDatabase({ can_upload: canUpload })]);
  setupBookmarksEndpoints([]);
  setupNullGetUserKeyValueEndpoints();

  const settings = createMockSettingsState({
    "uploads-settings": {
      db_id: 1,
      schema_name: null,
      table_prefix: null,
    },
    // The new-item menu loads metabot permissions in the background, and under
    // React 19 that query resolves after the fast tests finish, tripping the
    // act() warning guard. These tests do not exercise metabot, so keep it off.
    "metabot-enabled?": false,
  });

  const view = renderWithProviders(
    <Route
      path="/"
      element={
        <>
          <CollectionContent collectionId={firstCollectionId} {...overrides} />
          <FileUploadStatus />
        </>
      }
    />,
    {
      withRouter: true,
      withDND: true,
      storeInitialState: createMockState({
        settings,
      }),
    },
  );

  // wait for loading to complete
  if (canUpload) {
    await screen.findByTestId("upload-input");
  } else {
    await screen.findByTestId("collection-menu");
    await waitFor(() =>
      expect(fetchMock.callHistory.called("path:/api/database")).toBe(true),
    );
  }

  return view;
}

describe("CollectionContent file uploads", () => {
  let collections: Collection[];

  beforeEach(() => {
    collections = [
      firstCollection,
      secondCollection,
      thirdCollection,
      multipleModelsCollection,
    ];
    setupCollectionByIdEndpoint({ collections });
    setupCollectionsEndpoints({
      collections: [firstCollection, secondCollection, thirdCollection],
    });
    setupCollectionItemsEndpoint({
      collection: firstCollection,
      collectionItems: [],
    });
    setupCollectionItemsEndpoint({
      collection: secondCollection,
      collectionItems: [uploadedModel],
    });
    setupCollectionItemsEndpoint({
      collection: thirdCollection,
      collectionItems: [uploadedModel, uploadedModel2],
    });
    setupCollectionItemsEndpoint({
      collection: multipleModelsCollection,
      collectionItems: multipleUploadedModels,
    });
    fetchMock.get(
      "path:/api/table/123",
      createMockCollection({
        id: 123,
        name: "Fancy Table",
      }),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should show the upload button when the upload database allows uploads", async () => {
    await setupCollectionContent();

    expect(screen.getByLabelText("Upload data")).toBeInTheDocument();
  });

  it("should not show the upload button when the upload database does not allow uploads", async () => {
    await setupCollectionContent({ canUpload: false });

    expect(screen.queryByLabelText("Upload data")).not.toBeInTheDocument();
  });

  it("Should show a start exploring link on completion", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    fetchMock.post("path:/api/upload/csv", "3", { delay: 1000 });

    await setupCollectionContent();

    await userEvent.upload(
      screen.getByTestId("upload-input"),
      new File(["foo, bar"], "test.csv", { type: "text/csv" }),
    );

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(
      await screen.findByText("Uploading data to Collection …"),
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(
      await screen.findByRole("link", { name: /Start exploring/ }),
    ).toHaveAttribute("href", "/model/3");
  });

  it("Should allow new model creation when an appendable model exists", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    fetchMock.post("path:/api/upload/csv", "3", { delay: 1000 });

    await setupCollectionContent({ collectionId: secondCollectionId });

    await userEvent.upload(
      screen.getByTestId("upload-input"),
      new File(["foo, bar"], "test.csv", { type: "text/csv" }),
    );

    expect(
      await screen.findByText("Select upload destination"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Create model" }));

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(
      await screen.findByText("Uploading data to Second Collection …"),
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(
      await screen.findByRole("link", { name: /Start exploring/ }),
    ).toHaveAttribute("href", "/model/3");
  });

  it("Should default to appending to a single selectable model", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    fetchMock.post("path:/api/table/123/append-csv", "3", { delay: 1000 });

    await setupCollectionContent({ collectionId: secondCollectionId });

    await userEvent.upload(
      screen.getByTestId("upload-input"),
      new File(["foo, bar"], "test.csv", { type: "text/csv" }),
    );

    expect(
      await screen.findByText("Select upload destination"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByText("Append to a model"));
    const submitButton = await screen.findByRole("button", {
      name: "Append to model",
    });

    // only appendable model should be pre-selected
    expect(
      await screen.findByRole("textbox", { name: "Select a model" }),
    ).toHaveValue("my uploaded model");

    await waitFor(() => expect(submitButton).toBeEnabled());
    await userEvent.click(submitButton);

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(
      await screen.findByText(/Uploading data to Fancy Table/i),
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(
      await screen.findByRole("link", { name: /Start exploring/ }),
    ).toHaveAttribute("href", "/model/3");
  });

  it("Should allow selecting from appendable models", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    fetchMock.post("path:/api/table/123/append-csv", "3", { delay: 1000 });

    await setupCollectionContent({ collectionId: thirdCollection.id });

    await userEvent.upload(
      screen.getByTestId("upload-input"),
      new File(["foo, bar"], "test.csv", { type: "text/csv" }),
    );

    expect(
      await screen.findByText("Select upload destination"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByText("Append to a model"));
    const submitButton = await screen.findByRole("button", {
      name: "Append to model",
    });

    await userEvent.click(await screen.findByPlaceholderText("Select a model"));
    await userEvent.click(
      await within(await screen.findByRole("listbox")).findByText(
        "my uploaded model",
      ),
    );

    await waitFor(() => expect(submitButton).toBeEnabled());
    await userEvent.click(submitButton);

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(
      await screen.findByText(/Uploading data to Fancy Table/i),
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(
      await screen.findByRole("link", { name: /Start exploring/ }),
    ).toHaveAttribute("href", "/model/3");
    await screen.findByText("Data added to Fancy Table");
  });

  it("should keep the model picked to append to when there are multiple (metabase#53824)", async () => {
    fetchMock.get(
      "path:/api/table/203",
      createMockTable({ id: 203, name: "cat_breeds_20240201" }),
    );
    fetchMock.post("path:/api/table/203/append-csv", "13");

    await setupCollectionContent({ collectionId: multipleModelsCollection.id });

    await userEvent.upload(
      screen.getByTestId("upload-input"),
      new File(["name,legs\nTom,4\nGarfield,4"], "more_breeds.csv", {
        type: "text/csv",
      }),
    );

    await userEvent.click(
      await screen.findByRole("radio", { name: /Append to a model/ }),
    );

    const modelSelect = await screen.findByRole("textbox", {
      name: "Select a model",
    });
    await waitFor(() =>
      expect(modelSelect).toHaveValue("Star Wars Characters"),
    );

    await userEvent.click(modelSelect);
    await userEvent.click(
      await within(await screen.findByRole("listbox")).findByText("Cat Breeds"),
    );

    expect(screen.getByRole("textbox", { name: "Select a model" })).toHaveValue(
      "Cat Breeds",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Append to model" }),
    );

    expect(
      await screen.findByText("Data added to cat_breeds_20240201"),
    ).toBeInTheDocument();

    const appendCalls = fetchMock.callHistory.calls(/\/append-csv$/, {
      method: "POST",
    });
    expect(appendCalls.map(({ url }) => new URL(url).pathname)).toEqual([
      "/api/table/203/append-csv",
    ]);
  });

  it("Should allow replacing data in a model", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    fetchMock.post("path:/api/table/123/replace-csv", "3", { delay: 1000 });

    await setupCollectionContent({ collectionId: thirdCollection.id });

    await userEvent.upload(
      screen.getByTestId("upload-input"),
      new File(["foo, bar"], "test.csv", { type: "text/csv" }),
    );

    expect(
      await screen.findByText("Select upload destination"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByText("Replace data in a model"));
    const submitButton = await screen.findByRole("button", {
      name: "Replace model data",
    });

    await userEvent.click(await screen.findByPlaceholderText("Select a model"));
    await userEvent.click(
      await within(await screen.findByRole("listbox")).findByText(
        "my uploaded model",
      ),
    );

    await waitFor(() => expect(submitButton).toBeEnabled());
    await userEvent.click(submitButton);

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(
      await screen.findByText(/Uploading data to Fancy Table/i),
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(
      await screen.findByRole("link", { name: /Start exploring/ }),
    ).toHaveAttribute("href", "/model/3");
    await screen.findByText("Data replaced in Fancy Table");
  });

  it("Should show an error message on error", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    fetchMock.post(
      "path:/api/upload/csv",
      {
        throws: {
          data: { message: "Something went wrong", cause: "It's dead Jim" },
        },
        status: 400,
      },
      { delay: 1000 },
    );

    await setupCollectionContent();

    await userEvent.upload(
      screen.getByTestId("upload-input"),
      new File(["foo, bar"], "test.csv", { type: "text/csv" }),
    );

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(
      await screen.findByText("Uploading data to Collection …"),
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(
      await screen.findByText("Error uploading your file"),
    ).toBeInTheDocument();

    await userEvent.click(await screen.findByText("Show error details"));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  it("should not reopen the closed upload error details after the collection is trashed (metabase#55382)", async () => {
    fetchMock.post("path:/api/upload/csv", {
      status: 422,
      body: { message: "The CSV file contains duplicate column names." },
    });
    fetchMock.put(
      `path:/api/collection/${firstCollectionId}`,
      ({ options }) => {
        const body: unknown = JSON.parse(String(options.body));
        if (!isEqual(body, { archived: true })) {
          return { status: 400 };
        }
        collections[0] = { ...firstCollection, archived: true };
        return collections[0];
      },
    );

    const { store } = await setupCollectionContent();

    await userEvent.upload(
      screen.getByTestId("upload-input"),
      new File(["a,a\n1,2\n3,4"], "invalid.csv", { type: "text/csv" }),
    );

    expect(
      await screen.findByText("Error uploading your file"),
    ).toBeInTheDocument();
    const errorDetails = await screen.findByRole("dialog", {
      name: "Upload error details",
    });
    expect(
      within(errorDetails).getByText(
        "The CSV file contains duplicate column names.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      within(errorDetails).getByRole("button", { name: "Close" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Upload error details" }),
      ).not.toBeInTheDocument(),
    );

    await act(async () => {
      await store.dispatch(
        collectionApi.endpoints.updateCollection.initiate({
          id: firstCollectionId,
          archived: true,
        }),
      );
    });

    expect(
      await screen.findByText("This collection is in the trash."),
    ).toBeInTheDocument();
    expect(screen.getByText("Error uploading your file")).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Upload error details" }),
    ).not.toBeInTheDocument();
  });

  describe("loading state", () => {
    it("should rotate loading messages after 30 seconds", async () => {
      jest.useFakeTimers({ advanceTimers: true });
      fetchMock.post("path:/api/upload/csv", "3", { delay: 90 * 1000 });

      await setupCollectionContent();

      await userEvent.upload(
        screen.getByTestId("upload-input"),
        new File(["foo, bar"], "test.csv", { type: "text/csv" }),
      );

      act(() => {
        jest.advanceTimersByTime(1 * 1000);
      });

      expect(
        await screen.findByText("Uploading data to Collection …"),
      ).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(30 * 1000);
      });

      expect(await screen.findByText("Still working …")).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(30 * 1000);
      });

      expect(
        await screen.findByText("Arranging bits and bytes …"),
      ).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(30 * 1000);
      });

      expect(
        await screen.findByRole("link", { name: /Start exploring/ }),
      ).toHaveAttribute("href", "/model/3");
    });
  });
});
