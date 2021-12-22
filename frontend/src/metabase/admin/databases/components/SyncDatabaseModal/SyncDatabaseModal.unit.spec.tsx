import React from "react";
import { render, screen } from "@testing-library/react";
import SyncDatabaseModal from "./SyncDatabaseModal";
import { DatabaseCandidate, TableCandidate } from "../../types";

describe("SyncDatabaseModal", () => {
  it("should render with a table from the sample dataset", () => {
    const table = getTableCandidate();
    const database = getDatabaseCandidate({ tables: [table] });
    const onClose = jest.fn();

    render(
      <SyncDatabaseModal databaseCandidates={[database]} onClose={onClose} />,
    );

    expect(screen.getByText("Explore sample data")).toBeInTheDocument();
  });

  it("should render with no sample dataset", () => {
    const onClose = jest.fn();

    render(<SyncDatabaseModal databaseCandidates={[]} onClose={onClose} />);

    expect(screen.getByText("Explore your Metabase")).toBeInTheDocument();
  });
});

const getDatabaseCandidate = (
  opts?: Partial<DatabaseCandidate>,
): DatabaseCandidate => ({
  tables: [],
  ...opts,
});

const getTableCandidate = (opts?: Partial<TableCandidate>): TableCandidate => ({
  title: "Table",
  url: "/auto/table/1",
  ...opts,
});
