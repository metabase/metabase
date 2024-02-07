import fetchMock from "fetch-mock";
import { screen } from "@testing-library/react";
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
  createMockDatabase,
} from "metabase-types/api/mocks";
import CollectionContent from "metabase/collections/containers/CollectionContent";
import {
  setupBookmarksEndpoints,
  setupCollectionByIdEndpoint,
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

async function setup(overrides = {}) {
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

    expect(
      await screen.findByText("Uploading data to Fancy Table …"),
    ).toBeInTheDocument();

    expect(await screen.findByText("test.csv")).toBeInTheDocument();
  });

  it("Should show a start exploring link on completion", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    fetchMock.post("path:/api/card/from-csv", "3", { delay: 1000 });

    await setup();

    userEvent.upload(
      screen.getByTestId("upload-input"),
      new File(["foo, bar"], "test.csv", { type: "text/csv" }),
    );

    jest.advanceTimersByTime(500);

    expect(
      await screen.findByText("Uploading data to Collection …"),
    ).toBeInTheDocument();

    jest.advanceTimersByTime(1000);

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

    await setup();

    userEvent.upload(
      screen.getByTestId("upload-input"),
      new File(["foo, bar"], "test.csv", { type: "text/csv" }),
    );

    jest.advanceTimersByTime(500);

    expect(
      await screen.findByText("Uploading data to Collection …"),
    ).toBeInTheDocument();

    jest.advanceTimersByTime(500);

    expect(
      await screen.findByText("There was an error uploading the file"),
    ).toBeInTheDocument();

    userEvent.click(await screen.findByText("Show error details"));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  describe("loading state", () => {
    it("should rotate loading messages after 30 seconds", async () => {
      jest.useFakeTimers({ advanceTimers: true });
      fetchMock.post("path:/api/card/from-csv", "3", { delay: 90 * 1000 });

      await setup();

      userEvent.upload(
        screen.getByTestId("upload-input"),
        new File(["foo, bar"], "test.csv", { type: "text/csv" }),
      );

      jest.advanceTimersByTime(1 * 1000);

      expect(
        await screen.findByText("Uploading data to Collection …"),
      ).toBeInTheDocument();

      jest.advanceTimersByTime(30 * 1000);

      expect(await screen.findByText("Still working …")).toBeInTheDocument();

      jest.advanceTimersByTime(30 * 1000);

      expect(
        await screen.findByText("Arranging bits and bytes …"),
      ).toBeInTheDocument();

      jest.advanceTimersByTime(30 * 1000);

      expect(
        await screen.findByRole("link", { name: "Start exploring" }),
      ).toHaveAttribute("href", "/model/3");
    });
  });
});
