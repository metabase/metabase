import nock from "nock";

import { screen } from "__support__/ui";
import { SAMPLE_DATABASE } from "__support__/sample_database_fixture";

import { setup, setupVirtualizedLists } from "./common";

describe("DataPicker", () => {
  beforeAll(() => {
    setupVirtualizedLists();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it("shows data type picker by default", async () => {
    await setup();

    expect(screen.getByText(/Models/i)).toBeInTheDocument();
    expect(screen.getByText(/Raw Data/i)).toBeInTheDocument();
    expect(screen.getByText(/Saved Questions/i)).toBeInTheDocument();
  });

  it("handles no data scenario", async () => {
    await setup({ hasDataAccess: false });

    expect(
      screen.getByText(/To pick some data, you'll need to add some first/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Models/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Raw Data/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Saved Questions/i)).not.toBeInTheDocument();
  });

  it("allows to disable certain data types", async () => {
    await setup({
      filters: { types: type => type !== "raw-data" },
    });

    expect(screen.queryByText(/Raw Data/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Models/i)).toBeInTheDocument();
    expect(screen.getByText(/Saved Questions/i)).toBeInTheDocument();
  });

  it("automatically picks a data type if there's only one available", async () => {
    await setup({
      hasModels: false,
      filters: { types: type => type !== "questions" },
    });

    expect(await screen.findByText(/Orders/i)).toBeInTheDocument();
    expect(screen.getByText(/Sample Database/i)).toBeInTheDocument();
    SAMPLE_DATABASE.tables.forEach(table => {
      expect(screen.getByText(table.displayName())).toBeInTheDocument();
    });

    expect(screen.queryByText(/Raw Data/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Models/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Saved Questions/i)).not.toBeInTheDocument();
  });
});
