import { callMockEvent } from "__support__/events";
import { setupCollectionsEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockCollection, createMockUser } from "metabase-types/api/mocks";
import type { Download, DownloadsState } from "metabase-types/store";
import {
  createMockDownload,
  createMockState,
  createMockUpload,
} from "metabase-types/store/mocks";
import type { FileUploadState } from "metabase-types/store/upload";

import StatusListing from "./StatusListing";

const DatabaseStatusMock = () => <div>DatabaseStatus</div>;

jest.mock("../../containers/DatabaseStatus", () => DatabaseStatusMock);

interface setupProps {
  isAdmin?: boolean;
  upload?: FileUploadState;
  downloads?: DownloadsState;
}

const setup = ({
  isAdmin = false,
  upload = {},
  downloads = [],
}: setupProps = {}) => {
  setupCollectionsEndpoints({ collections: [createMockCollection({})] });

  return renderWithProviders(<StatusListing />, {
    storeInitialState: createMockState({
      currentUser: createMockUser({
        is_superuser: isAdmin,
      }),
      upload,
      downloads,
    }),
  });
};

describe("StatusListing", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("should render database statuses for admins", () => {
    setup({ isAdmin: true });
    expect(screen.getByText("DatabaseStatus")).toBeInTheDocument();
  });

  it("should not render database statuses for non-admins", () => {
    setup();
    expect(screen.queryByText("DatabaseStatus")).not.toBeInTheDocument();
  });

  it("should not render if no one is logged in", () => {
    setupCollectionsEndpoints({ collections: [createMockCollection({})] });
    renderWithProviders(<StatusListing />);
    expect(screen.queryByText("DatabaseStatus")).not.toBeInTheDocument();
  });

  it("should give an alert if a user navigates away from the page during an upload", () => {
    const mockEventListener = jest.spyOn(window, "addEventListener");

    const mockUpload = createMockUpload();
    setup({ isAdmin: true, upload: { [mockUpload.id]: mockUpload } });

    const mockEvent = callMockEvent(mockEventListener, "beforeunload");
    expect(mockEvent.returnValue).toEqual(
      "CSV Upload in progress. Are you sure you want to leave?",
    );
    expect(mockEvent.preventDefault).toHaveBeenCalled();
  });

  it("should not give an alert if a user navigates away from the page while no uploads are in progress", () => {
    const mockEventListener = jest.spyOn(window, "addEventListener");

    setup({ isAdmin: true });

    const mockEvent = callMockEvent(mockEventListener, "beforeunload");
    expect(mockEvent.returnValue).toBeUndefined();
  });

  describe("downloads status", () => {
    it("should alert when user navigates away from the page during an export", () => {
      const mockEventListener = jest.spyOn(window, "addEventListener");

      setup({ downloads: [createMockDownload()] });

      const mockEvent = callMockEvent(mockEventListener, "beforeunload");
      expect(mockEvent.returnValue).toEqual(
        "Export in progress. Are you sure you want to leave?",
      );
      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });

    it.each([
      [[]],
      [[createMockDownload({ status: "complete" })]],
      [[createMockDownload({ status: "error" })]],
    ])(
      "should not alert when user navigates away when there is no export in progress",
      (downloadsState: Download[]) => {
        const mockEventListener = jest.spyOn(window, "addEventListener");

        setup({
          downloads: downloadsState,
        });

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.returnValue).toBeUndefined();
      },
    );
  });
});
