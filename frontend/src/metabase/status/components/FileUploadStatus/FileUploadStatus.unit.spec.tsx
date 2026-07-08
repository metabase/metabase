import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState, createMockUpload } from "metabase/redux/store/mocks";
import { createMockCollection } from "metabase-types/api/mocks";

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
});
