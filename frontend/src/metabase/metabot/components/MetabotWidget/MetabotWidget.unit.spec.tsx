import React from "react";
import { Route } from "react-router";
import userEvent from "@testing-library/user-event";
import { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";
import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForElementToBeRemoved,
} from "__support__/ui";
import MetabotWidget from "./MetabotWidget";

const TEST_DATABASE = createMockDatabase({
  id: 1,
  name: "Database 1",
});

interface SetupOpts {
  databases: Database[];
}

const setup = async ({ databases }: SetupOpts) => {
  setupSearchEndpoints([]);
  setupDatabasesEndpoints(databases);

  const { history } = renderWithProviders(
    <Route path="/" component={MetabotWidget} />,
    { withRouter: true },
  );

  await waitForElementToBeRemoved(() => screen.queryAllByText(/Loading/i));

  return { history };
};

describe("MetabotWidget", () => {
  it("should redirect to the database metabot page with the prompt", async () => {
    const prompt = "prompt";
    const { history } = await setup({ databases: [TEST_DATABASE] });

    userEvent.type(screen.getByPlaceholderText("Ask something…"), prompt);
    userEvent.click(screen.getByRole("button", { name: "play icon" }));

    const location = history?.getCurrentLocation();
    expect(location?.pathname).toBe(`/metabot/database/${TEST_DATABASE.id}`);
    expect(location?.query).toEqual({ prompt });
  });
});
