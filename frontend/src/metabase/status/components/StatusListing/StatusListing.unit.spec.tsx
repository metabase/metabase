import React from "react";
import { render, screen } from "@testing-library/react";
import StatusListing from "./StatusListing";

const DatabaseStatusListingMock = () => <div>DatabaseStatusListing</div>;

jest.mock(
  "../../containers/DatabaseStatusListing",
  () => DatabaseStatusListingMock,
);

describe("StatusListing", () => {
  it("should render database statuses for admins", () => {
    render(<StatusListing isAdmin={true} />);

    expect(screen.getByText("DatabaseStatusListing")).toBeInTheDocument();
  });

  it("should render database statuses for admins", () => {
    render(<StatusListing isAdmin={false} />);

    expect(screen.queryByText("DatabaseStatusListing")).not.toBeInTheDocument();
  });
});
