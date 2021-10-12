import React from "react";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import xhrMock from "xhr-mock";

import { InfoText } from "./InfoText";

const collection = { id: 1, name: "Collection Name" };
const table = { id: 1, display_name: "Table Name" };
const database = { id: 1, name: "Database Name" };

async function setup(result) {
  xhrMock.get("/api/table/1", {
    body: JSON.stringify(table),
  });

  xhrMock.get("/api/database/1", {
    body: JSON.stringify(database),
  });

  renderWithProviders(<InfoText result={result} />);
}

describe("InfoText", () => {
  beforeEach(() => {
    xhrMock.setup();
  });

  afterEach(() => {
    xhrMock.teardown();
  });

  it("shows collection info for a question", async () => {
    await setup({
      model: "card",
      getCollection: () => collection,
    });
    expect(screen.queryByText("Saved question in")).toHaveTextContent(
      "Saved question in Collection Name",
    );
  });

  it("shows collection info for a collection", async () => {
    const collection = { id: 1, name: "Collection Name" };
    await setup({
      model: "collection",
      collection,
    });
    expect(screen.queryByText("Collection")).toBeInTheDocument();
  });

  it("shows Database for databases", async () => {
    await setup({
      model: "database",
    });
    expect(screen.queryByText("Database")).toBeInTheDocument();
  });

  it("shows segment's table name", async () => {
    await setup({
      model: "segment",
      table_id: 1,
      database_id: 1,
    });

    await waitFor(() => screen.queryByText("Table Name"));
    expect(screen.queryByText("Segment of")).toHaveTextContent(
      "Segment of Table Name",
    );
  });

  it("shows metric's table name", async () => {
    await setup({
      model: "metric",
      table_id: 1,
      database_id: 1,
    });

    await waitFor(() => screen.queryByText("Table Name"));
    expect(screen.queryByText("Metric for")).toHaveTextContent(
      "Metric for Table Name",
    );
  });

  it("shows table's schema", async () => {
    await setup({
      model: "table",
      table_id: 1,
      database_id: 1,
    });

    await waitFor(() => screen.queryByText("Database Name"));
    expect(screen.queryByText("Table in")).toHaveTextContent(
      "Table in Database Name",
    );
  });

  it("shows pulse's collection", async () => {
    await setup({
      model: "pulse",
      getCollection: () => collection,
    });

    expect(screen.queryByText("Pulse in")).toHaveTextContent(
      "Pulse in Collection Name",
    );
  });

  it("shows dashboard's collection", async () => {
    await setup({
      model: "dashboard",
      getCollection: () => collection,
    });

    expect(screen.queryByText("Dashboard in")).toHaveTextContent(
      "Dashboard in Collection Name",
    );
  });
});
