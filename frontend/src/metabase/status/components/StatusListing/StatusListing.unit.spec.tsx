import { callMockEvent } from "__support__/events";
import {
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui-with-store";
import type { DownloadsState } from "metabase/redux/store";
import {
  createMockDownload,
  createMockState,
  createMockUpload,
} from "metabase/redux/store/mocks";
import type { FileUploadState } from "metabase/redux/store/upload";
import type { Database } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockUser,
} from "metabase-types/api/mocks";

import { StatusListing } from "./StatusListing";

interface setupProps {
  isAdmin?: boolean;
  upload?: FileUploadState;
  downloads?: DownloadsState;
  databases?: Database[];
}

const setup = async ({
  isAdmin = false,
  upload = {},
  downloads = { datasetRequests: [], isDownloadingToImage: false },
  databases = [],
}: setupProps = {}) => {
  setupCollectionsEndpoints({ collections: [createMockCollection({})] });
  setupDatabasesEndpoints(databases);

  const view = renderWithProviders(<StatusListing />, {
    storeInitialState: createMockState({
      currentUser: createMockUser({
        id: 1,
        is_superuser: isAdmin,
      }),
      upload,
      downloads,
    }),
  });

  if (isAdmin) {
    await waitForDatabaseMetadata(view, databases);
  }

  return view;
};

describe("StatusListing", () => {
  afterEach(() => {
    jest.resetAllMocks();
    document.body.classList.remove("sync-status-visible");
  });

  it("should render database sync status for admins", async () => {
    await setup({
      isAdmin: true,
      databases: [
        createMockDatabase({
          creator_id: 1,
          initial_sync_status: "incomplete",
        }),
      ],
    });

    expect(await screen.findByText("Syncing…")).toBeInTheDocument();
  });

  it("should not render database sync status for non-admins", async () => {
    await setup({
      databases: [
        createMockDatabase({
          creator_id: 1,
          initial_sync_status: "incomplete",
        }),
      ],
    });

    expect(screen.queryByText("Syncing…")).not.toBeInTheDocument();
  });

  it("should not render if no one is logged in", async () => {
    setupCollectionsEndpoints({ collections: [createMockCollection({})] });
    setupDatabasesEndpoints([]);
    const view = renderWithProviders(<StatusListing />);
    await waitForDatabaseMetadata(view, []);
    expect(screen.queryByText("Syncing…")).not.toBeInTheDocument();
  });

  it("should give an alert if a user navigates away from the page during an upload", async () => {
    const mockEventListener = jest.spyOn(window, "addEventListener");

    const mockUpload = createMockUpload();
    await setup({ isAdmin: true, upload: { [mockUpload.id]: mockUpload } });

    const mockEvent = callMockEvent(mockEventListener, "beforeunload");
    expect(mockEvent.returnValue).toEqual(
      "CSV Upload in progress. Are you sure you want to leave?",
    );
    expect(mockEvent.preventDefault).toHaveBeenCalled();
  });

  it("should not give an alert if a user navigates away from the page while no uploads are in progress", async () => {
    const mockEventListener = jest.spyOn(window, "addEventListener");

    await setup({ isAdmin: true });

    const mockEvent = callMockEvent(mockEventListener, "beforeunload");
    expect(mockEvent.returnValue).toBeUndefined();
  });

  describe("downloads status", () => {
    it("should alert when user navigates away from the page during an export", async () => {
      const mockEventListener = jest.spyOn(window, "addEventListener");

      await setup({
        downloads: {
          datasetRequests: [createMockDownload()],
          isDownloadingToImage: false,
        },
      });

      const mockEvent = callMockEvent(mockEventListener, "beforeunload");
      expect(mockEvent.returnValue).toEqual(
        "Export in progress. Are you sure you want to leave?",
      );
      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });

    it.each([
      [{ datasetRequests: [], isDownloadingToImage: false }],
      [
        {
          datasetRequests: [createMockDownload({ status: "complete" })],
          isDownloadingToImage: false,
        },
      ],
      [
        {
          datasetRequests: [createMockDownload({ status: "error" })],
          isDownloadingToImage: false,
        },
      ],
    ])(
      "should not alert when user navigates away when there is no export in progress",
      async (downloadsState: DownloadsState) => {
        const mockEventListener = jest.spyOn(window, "addEventListener");

        await setup({
          downloads: downloadsState,
        });

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.returnValue).toBeUndefined();
      },
    );
  });
});

async function waitForDatabaseMetadata(
  view: ReturnType<typeof renderWithProviders>,
  databases: Database[],
) {
  await waitFor(() => {
    for (const database of databases) {
      expect(
        view.store.getState().entities.databases[database.id],
      ).toBeTruthy();
    }
  });
}
