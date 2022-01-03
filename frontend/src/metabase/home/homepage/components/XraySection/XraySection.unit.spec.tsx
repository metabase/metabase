import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatabaseCandidate, TableCandidate, User } from "../../types";
import XraySection from "./XraySection";

describe("XraySection", () => {
  it("should display table candidates", () => {
    const user = getUser();
    const databaseCandidates = [
      getDatabaseCandidate({
        tables: [getTableCandidate({ title: "Orders table" })],
      }),
    ];

    render(<XraySection user={user} databaseCandidates={databaseCandidates} />);

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
        databaseCandidates={databaseCandidates}
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

    render(<XraySection user={user} databaseCandidates={databaseCandidates} />);

    expect(screen.queryByLabelText("close icon")).not.toBeInTheDocument();
  });

  it("should allow changing database schema for table candidates", () => {
    const user = getUser();
    const databaseCandidates = [
      getDatabaseCandidate({
        schema: "public",
        tables: [getTableCandidate({ title: "Public table" })],
      }),
      getDatabaseCandidate({
        schema: "admin",
        tables: [getTableCandidate({ title: "Admin table" })],
      }),
    ];

    render(<XraySection user={user} databaseCandidates={databaseCandidates} />);

    expect(screen.getByText("Public table")).toBeInTheDocument();
    expect(screen.queryByText("Admin table")).not.toBeInTheDocument();

    userEvent.click(screen.getByText("public"));
    userEvent.click(screen.getByText("admin"));

    expect(screen.queryByText("Public table")).not.toBeInTheDocument();
    expect(screen.getByText("Admin table")).toBeInTheDocument();
  });
});

const getUser = (opts?: Partial<User>): User => ({
  id: 1,
  first_name: "John",
  is_superuser: false,
  has_invited_second_user: false,
  personal_collection_id: "personal",
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
  schema: "public",
  tables: [],
  ...opts,
});
