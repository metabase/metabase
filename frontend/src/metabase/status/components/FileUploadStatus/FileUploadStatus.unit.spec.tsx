import fetchMock from "fetch-mock";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import {
  createMockUpload,
  createMockState,
  createMockSettingsState,
} from "metabase-types/store/mocks";

import { renderWithProviders } from "__support__/ui";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
} from "metabase-types/api/mocks";
import { CollectionContent } from "metabase/collections/components/CollectionContent";
import {
  setupBookmarksEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { FileUploadStatus } from "./FileUploadStatus";

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

const uploadedModel = createMockCollectionItem({
  id: 3,
  name: "my uploaded model",
  collection: secondCollection,
  model: "dataset",
  based_on_upload: 123,
});

async function setupCollectionContent(overrides = {}) {
  setupDatabasesEndpoints([createMockDatabase({ can_upload: true })]);
  setupSearchEndpoints([]);
  setupBookmarksEndpoints([]);

  const settings = createMockSettingsState({
    "uploads-enabled": true,
    "uploads-database-id": 1,
  });

  renderWithProviders(
    <Route
      path="/"
      component={() => {
        return (
          <>
            <CollectionContent
              collectionId={firstCollectionId}
              {...overrides}
            />
            <FileUploadStatus />
          </>
        );
      }}
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
  await screen.findByTestId("upload-input");
}

describe("FileUploadStatus", () => {
  beforeEach(() => {
    setupCollectionByIdEndpoint({
      collections: [firstCollection, secondCollection],
    });
    setupCollectionsEndpoints({
      collections: [firstCollection, secondCollection],
    });
    setupCollectionItemsEndpoint({
      collection: secondCollection,
      collectionItems: [uploadedModel],
    });
    setupCollectionItemsEndpoint({
      collection: firstCollection,
      collectionItems: [],
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

  it("Should group uploads by collection", async () => {
    const uploadOne = createMockUpload({
      collectionId: firstCollectionId,
      id: 1,
    });

    const uploadTwo = createMockUpload({
      collectionId: secondCollectionId,
      id: 2,
      name: "test two.csv",
    });

    const uploadThree = createMockUpload({
      collectionId: firstCollectionId,
      id: 3,
      name: "test three.csv",
    });

    renderWithProviders(<FileUploadStatus />, {
      storeInitialState: createMockState({
        upload: {
          [uploadOne.id]: uploadOne,
          [uploadTwo.id]: uploadTwo,
          [uploadThree.id]: uploadThree,
        },
      }),
    });

    expect(
      await screen.findByText("Uploading data to Collection …"),
    ).toBeInTheDocument();

    expect(
      await screen.findByText("Uploading data to Second Collection …"),
    ).toBeInTheDocument();

    expect(await screen.findByText("test.csv")).toBeInTheDocument();

    expect(await screen.findByText("test two.csv")).toBeInTheDocument();

    expect(await screen.findByText("test three.csv")).toBeInTheDocument();
  });

  it("Should show upload status for a table append", async () => {
    const uploadOne = createMockUpload({
      tableId: 123,
      collectionId: undefined,
      id: 1,
    });

    renderWithProviders(<FileUploadStatus />, {
      storeInitialState: createMockState({
        upload: {
          [1]: uploadOne,
        },
      }),
    });

    expect(
      await screen.findByText("Uploading data to Fancy Table …"),
    ).toBeInTheDocument();

    expect(await screen.findByText("test.csv")).toBeInTheDocument();
  });

  it("Should show a start exploring link on completion", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    fetchMock.post("path:/api/card/from-csv", "3", { delay: 1000 });

    await setupCollectionContent();

    userEvent.upload(
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
      await screen.findByRole("link", { name: "Start exploring" }),
    ).toHaveAttribute("href", "/model/3");
  });

  it("Should allow new model creation when an appendable model exists", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    fetchMock.post("path:/api/card/from-csv", "3", { delay: 1000 });

    await setupCollectionContent({ collectionId: secondCollectionId });

    userEvent.upload(
      screen.getByTestId("upload-input"),
      new File(["foo, bar"], "test.csv", { type: "text/csv" }),
    );

    expect(
      await screen.findByText("Select upload destination"),
    ).toBeInTheDocument();

    userEvent.click(screen.getByRole("button", { name: "Create" }));

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
      await screen.findByRole("link", { name: "Start exploring" }),
    ).toHaveAttribute("href", "/model/3");
  });

  it("Should allow appends from collections when an appendable model exists", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    fetchMock.post("path:/api/table/123/append-csv", "3", { delay: 1000 });

    await setupCollectionContent({ collectionId: secondCollectionId });

    userEvent.upload(
      screen.getByTestId("upload-input"),
      new File(["foo, bar"], "test.csv", { type: "text/csv" }),
    );

    expect(
      await screen.findByText("Select upload destination"),
    ).toBeInTheDocument();

    userEvent.click(screen.getByText("Append to a model"));
    const submitButton = await screen.findByRole("button", { name: "Append" });
    expect(submitButton).toBeDisabled(); // should be disabled until a model is selected

    userEvent.click(await screen.findByPlaceholderText("Select a model"));
    userEvent.click(
      await within(await screen.findByRole("listbox")).findByText(
        "my uploaded model",
      ),
    );

    await waitFor(() => expect(submitButton).toBeEnabled());
    userEvent.click(submitButton);

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
      await screen.findByRole("link", { name: "Start exploring" }),
    ).toHaveAttribute("href", "/model/3");
  });

  it("Should show an error message on error", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    fetchMock.post(
      "path:/api/card/from-csv",
      {
        throws: {
          data: { message: "Something went wrong", cause: "It's dead Jim" },
        },
        status: 400,
      },
      { delay: 1000 },
    );

    await setupCollectionContent();

    userEvent.upload(
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

    userEvent.click(await screen.findByText("Show error details"));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  describe("loading state", () => {
    it("should rotate loading messages after 30 seconds", async () => {
      jest.useFakeTimers({ advanceTimers: true });
      fetchMock.post("path:/api/card/from-csv", "3", { delay: 90 * 1000 });

      await setupCollectionContent();

      userEvent.upload(
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
        await screen.findByRole("link", { name: "Start exploring" }),
      ).toHaveAttribute("href", "/model/3");
    });
  });
});
