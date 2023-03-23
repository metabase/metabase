import React from "react";
import { Route } from "react-router";
import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";
import { createMockDatabase } from "metabase-types/api/mocks";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";

import DatabaseListApp from "./DatabaseListApp";

interface SetupOpts {
  error?: string;
}

function setup({ error }: SetupOpts = {}) {
  if (!error) {
    setupDatabasesEndpoints([
      createMockDatabase({
        name: "PostgreSQL Database",
        engine: "postgres",
      }),
    ]);
  } else {
    fetchMock.get("path:/api/database", {
      status: 500,
      body: { message: error },
    });
  }

  renderWithProviders(
    <Route path="/admin/databases" component={DatabaseListApp} />,
    { withRouter: true, initialRoute: "/admin/databases" },
  );
}

describe("DatabaseListApp", () => {
  it("should render the component", async () => {
    setup();

    expect(
      await screen.findByRole("link", { name: "PostgreSQL Database" }),
    ).toBeInTheDocument();
    expect(screen.getByText("postgres")).toBeInTheDocument();
  });

  it("should display error message from API response", async () => {
    const expectedErrorMessage = "BE throw some error";
    setup({ error: expectedErrorMessage });

    userEvent.click(await screen.findByText("Show error details"));
    expect(await screen.findByText(expectedErrorMessage)).toBeInTheDocument();
    expect(screen.getByText("Hide error details")).toBeInTheDocument();
  });
});
