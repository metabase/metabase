import React from "react";
import { render, screen } from "@testing-library/react";
import { SyncDatabaseApp } from "./SyncDatabaseApp";

const SyncModalSwitch = () => <div>SyncModalSwitch</div>;
const SyncSnackbarSwitch = () => <div>SyncSnackbarSwitch</div>;

jest.mock("../../components/SyncModal", () => SyncModalSwitch);
jest.mock("../../components/SyncSnackbar", () => SyncSnackbarSwitch);

describe("SyncDatabaseApp", () => {
  it("should display syncing indicators for an dmin user", () => {
    render(<SyncDatabaseApp isAdmin={true} />);

    expect(screen.queryByText("SyncModalSwitch")).toBeInTheDocument();
    expect(screen.queryByText("SyncSnackbarSwitch")).toBeInTheDocument();
  });

  it("should not display syncing indicators for a non-admin user", () => {
    render(<SyncDatabaseApp isAdmin={false} />);

    expect(screen.queryByText("SyncModalSwitch")).not.toBeInTheDocument();
    expect(screen.queryByText("SyncSnackbarSwitch")).not.toBeInTheDocument();
  });
});
