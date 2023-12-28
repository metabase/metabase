import { screen } from "__support__/ui";

import { setup, SAMPLE_DATABASE, SAMPLE_TABLE } from "./common";

describe("DataPicker", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
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

    expect(
      await screen.findByText(SAMPLE_TABLE.display_name),
    ).toBeInTheDocument();
    expect(screen.getByText(SAMPLE_DATABASE.name)).toBeInTheDocument();
    SAMPLE_DATABASE.tables?.forEach(table => {
      expect(screen.getByText(table.display_name)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Raw Data/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Models/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Saved Questions/i)).not.toBeInTheDocument();
  });
});
