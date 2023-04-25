import React from "react";
import { renderWithProviders, screen } from "__support__/ui";
import { setupCollectionsEndpoints } from "__support__/server-mocks";
import { createMockCollection, createMockUser } from "metabase-types/api/mocks";

import { createMockState, createMockUpload } from "metabase-types/store/mocks";
import { FileUploadState } from "metabase-types/store/upload";
import StatusListing from "./StatusListing";

// calls event handler in the mockEventListener that matches the eventName
// and uses the mockEvent to hold the callback's return value
const callMockEvent = (
  mockEventListener: jest.SpyInstance,
  eventName: string,
): {
  preventDefault: jest.Mock;
  returnValue?: string;
} => {
  const mockEvent = {
    preventDefault: jest.fn(),
  };

  mockEventListener.mock.calls
    .filter(([event]) => eventName === event)
    .forEach(([_, callback]) => callback(mockEvent));
  return mockEvent;
};
const DatabaseStatusMock = () => <div>DatabaseStatus</div>;

jest.mock("../../containers/DatabaseStatus", () => DatabaseStatusMock);

interface setupProps {
  isAdmin?: boolean;
  upload?: FileUploadState;
}

const setup = ({ isAdmin = false, upload = {} }: setupProps = {}) => {
  setupCollectionsEndpoints([createMockCollection({})]);

  return renderWithProviders(<StatusListing />, {
    storeInitialState: createMockState({
      currentUser: createMockUser({
        is_superuser: isAdmin,
      }),
      upload,
    }),
  });
};

describe("StatusListing", () => {
  it("should render database statuses for admins", () => {
    setup({ isAdmin: true });
    expect(screen.getByText("DatabaseStatus")).toBeInTheDocument();
  });

  it("should not render database statuses for non-admins", () => {
    setup();
    expect(screen.queryByText("DatabaseStatus")).not.toBeInTheDocument();
  });

  it("should not render if no one is logged in", () => {
    setupCollectionsEndpoints([createMockCollection({})]);
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
});
