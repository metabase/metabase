import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import XraySection from "./XraySection";

describe("XraySection", () => {
  it("should display table candidates", () => {
    const user = getUser();
    const databaseCandidates = [
      getDatabaseCandidate({
        tables: [getTableCandidate({ title: "Orders table" })],
      }),
    ];

    render(
      <XraySection
        user={user}
        dashboards={[]}
        databaseCandidates={databaseCandidates}
        showXrays
      />,
    );

    expect(
      screen.getByText("Try these x-rays based on your data"),
    ).toBeInTheDocument();
    expect(screen.getByText("Orders table")).toBeInTheDocument();
  });

  it("should allow admins to hide the section", () => {
    const user = getUser({ is_superuser: true });
    const databaseCandidates = [
      getDatabaseCandidate({
        tables: [getTableCandidate({ title: "Orders table" })],
      }),
    ];
    const onHideXrays = jest.fn();

    render(
      <XraySection
        user={user}
        dashboards={[]}
        databaseCandidates={databaseCandidates}
        showXrays
        onHideXrays={onHideXrays}
      />,
    );

    userEvent.click(screen.getByLabelText("close icon"));
    userEvent.click(screen.getByText("Remove"));

    expect(onHideXrays).toHaveBeenCalled();
  });

  it("should not allow non-admins to hide the section", () => {
    const user = getUser({ is_superuser: false });
    const databaseCandidates = [
      getDatabaseCandidate({
        tables: [getTableCandidate({ title: "Orders table" })],
      }),
    ];

    render(
      <XraySection
        user={user}
        dashboards={[]}
        databaseCandidates={databaseCandidates}
        showXrays
      />,
    );

    expect(screen.queryByLabelText("close icon")).not.toBeInTheDocument();
  });

  it("should not be visible when hidden by the setting", () => {
    const user = getUser();
    const databaseCandidates = [
      getDatabaseCandidate({ tables: [getTableCandidate()] }),
    ];

    render(
      <XraySection
        user={user}
        dashboards={[]}
        databaseCandidates={databaseCandidates}
        showXrays={false}
      />,
    );
  });

  it("should not be visible when there are pinned dashboards", () => {
    const user = getUser();
    const dashboards = [getDashboard()];

    render(<XraySection user={user} dashboards={dashboards} showXrays />);

    expect(screen.queryByText(/x-rays/)).not.toBeInTheDocument();
  });

  it("should not be visible when there are no table candidates", () => {
    const user = getUser();
    const dashboards = [];
    const databaseCandidates = [getDatabaseCandidate()];

    render(
      <XraySection
        user={user}
        dashboards={dashboards}
        databaseCandidates={databaseCandidates}
        showXrays
      />,
    );

    expect(screen.queryByText(/x-rays/)).not.toBeInTheDocument();
  });
});

const getUser = ({ is_superuser = false } = {}) => ({ is_superuser });

const getDashboard = ({ id = 1 } = {}) => ({ id });

const getTableCandidate = ({ title, url = "/" } = {}) => ({ title, url });

const getDatabaseCandidate = ({ tables = [] } = {}) => ({ tables });
