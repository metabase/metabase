import React from "react";
import { renderWithProviders, screen } from "__support__/ui";
import { setupCollectionsEndpoints } from "__support__/server-mocks";
import { createMockCollection } from "metabase-types/api/mocks";

import {
  StatusListingView as StatusListing,
  StatusListingProps,
} from "./StatusListing";

const DatabaseStatusMock = () => <div>DatabaseStatus</div>;

jest.mock("../../containers/DatabaseStatus", () => DatabaseStatusMock);

const setup = (options?: Partial<StatusListingProps>) => {
  setupCollectionsEndpoints([createMockCollection()]);

  return renderWithProviders(<StatusListing isAdmin isLoggedIn {...options} />);
};

describe("StatusListing", () => {
  it("should render database statuses for admins", () => {
    setup({
      isAdmin: true,
      isLoggedIn: true,
    });

    expect(screen.getByText("DatabaseStatus")).toBeInTheDocument();
  });

  it("should not render database statuses for non-admins", () => {
    renderWithProviders(<StatusListing isAdmin={false} isLoggedIn />);

    expect(screen.queryByText("DatabaseStatus")).not.toBeInTheDocument();
  });
});
