import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Dashboard,
  DatabaseCandidate,
  TableCandidate,
  User,
} from "../../types";
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
    const databaseCandidates = [getDatabaseCandidate()];

    render(
      <XraySection
        user={user}
        dashboards={[]}
        databaseCandidates={databaseCandidates}
        showXrays
      />,
    );

    expect(screen.queryByText(/x-rays/)).not.toBeInTheDocument();
  });
});

const getUser = (opts?: Partial<User>): User => ({
  id: 1,
  first_name: "John",
  is_superuser: false,
  personal_collection_id: "personal",
  ...opts,
});

const getDashboard = (opts?: Partial<Dashboard>): Dashboard => ({
  id: 1,
  name: "Our dashboard",
  ...opts,
});

const getTableCandidate = (opts?: Partial<TableCandidate>): TableCandidate => ({
  title: "Our table",
  url: "/auto",
  ...opts,
});

const getDatabaseCandidate = (
  opts?: Partial<DatabaseCandidate>,
): DatabaseCandidate => ({
  tables: [],
  ...opts,
});
