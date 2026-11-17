import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  findRequests,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDatabaseEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState, createMockUpload } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import {
  createMockCollection,
  createMockDatabase,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

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
  afterEach(() => {
    reinitialize();
  });

  beforeEach(() => {
    setupCollectionByIdEndpoint({
      collections: [firstCollection, secondCollection],
    });
    setupCollectionsEndpoints({
      collections: [firstCollection, secondCollection],
    });
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
      tableName: "Fancy Table",
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

  it.each([
    {
      hosting: false,
      attachedDwh: false,
      expectedText: "Code: 497 storage is full",
      fetchesDatabase: false,
    },
    {
      hosting: false,
      attachedDwh: true,
      expectedText: "Code: 497 storage is full",
      fetchesDatabase: false,
    },
    {
      hosting: true,
      attachedDwh: false,
      expectedText: "Code: 497 storage is full",
      fetchesDatabase: false,
    },
    {
      hosting: true,
      attachedDwh: true,
      expectedText: "Couldn't upload the file, storage is full",
      fetchesDatabase: true,
    },
  ])(
    "should show the correct upload error when hosting is $hosting and attached_dwh is $attachedDwh",
    async ({ hosting, attachedDwh, expectedText, fetchesDatabase }) => {
      const upload = createMockUpload({
        id: 1,
        collectionId: firstCollectionId,
        status: "error",
        error: "Code: 497 storage is full",
      });
      setupDatabaseEndpoints(
        createMockDatabase({ id: 99, is_attached_dwh: true }),
      );
      const state = createMockState({
        upload: { [upload.id]: upload },
        currentUser: createMockUser({ is_superuser: true }),
        settings: mockSettings({
          "token-features": createMockTokenFeatures({
            hosting,
            attached_dwh: attachedDwh,
          }),
          "uploads-settings": {
            db_id: 99,
            schema_name: "uploads",
            table_prefix: "uploaded_",
          },
        }),
      });
      setupEnterpriseOnlyPlugin("upload_management");

      renderWithProviders(<FileUploadStatus />, { storeInitialState: state });

      expect(await screen.findByText(expectedText)).toBeInTheDocument();
      const requests = await findRequests("GET");
      expect(requests.some(({ url }) => url.endsWith("/api/database/99"))).toBe(
        fetchesDatabase,
      );
    },
  );
});
