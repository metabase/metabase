import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMockDatabaseCandidate,
  createMockTableCandidate,
  createMockUser,
} from "metabase-types/api/mocks";
import XraySection from "./XraySection";

describe("XraySection", () => {
  it("should display table candidates", () => {
    const user = createMockUser();
    const databaseCandidates = [
      createMockDatabaseCandidate({
        tables: [createMockTableCandidate({ title: "Orders table" })],
      }),
    ];

    render(<XraySection user={user} databaseCandidates={databaseCandidates} />);

    expect(
      screen.getByText("Try these x-rays based on your data"),
    ).toBeInTheDocument();
    expect(screen.getByText("Orders table")).toBeInTheDocument();
  });

  it("should allow admins to hide the section", () => {
    const user = createMockUser({ is_superuser: true });
    const databaseCandidates = [
      createMockDatabaseCandidate({
        tables: [createMockTableCandidate({ title: "Orders table" })],
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
    const user = createMockUser({ is_superuser: false });
    const databaseCandidates = [
      createMockDatabaseCandidate({
        tables: [createMockTableCandidate({ title: "Orders table" })],
      }),
    ];

    render(<XraySection user={user} databaseCandidates={databaseCandidates} />);

    expect(screen.queryByLabelText("close icon")).not.toBeInTheDocument();
  });

  it("should allow changing database schema for table candidates", () => {
    const user = createMockUser();
    const databaseCandidates = [
      createMockDatabaseCandidate({
        schema: "public",
        tables: [createMockTableCandidate({ title: "Public table" })],
      }),
      createMockDatabaseCandidate({
        schema: "admin",
        tables: [createMockTableCandidate({ title: "Admin table" })],
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
