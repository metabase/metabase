import React from "react";
import { render, screen } from "@testing-library/react";
import SyncProgress from "./SyncProgress";

const SyncModal = () => <div>SyncModal</div>;
const SyncSnackbar = () => <div>SyncSnackbar</div>;

jest.mock("../../containers/SyncModal", () => SyncModal);
jest.mock("../../containers/SyncSnackbar", () => SyncSnackbar);

describe("SyncProgress", () => {
  it("should display syncing indicators for an admin user", () => {
    render(<SyncProgress isAdmin={true} />);

    expect(screen.getByText("SyncModal")).toBeInTheDocument();
    expect(screen.getByText("SyncSnackbar")).toBeInTheDocument();
  });

  it("should not display syncing indicators for a non-admin user", () => {
    render(<SyncProgress isAdmin={false} />);

    expect(screen.queryByText("SyncModal")).not.toBeInTheDocument();
    expect(screen.queryByText("SyncSnackbar")).not.toBeInTheDocument();
  });
});
