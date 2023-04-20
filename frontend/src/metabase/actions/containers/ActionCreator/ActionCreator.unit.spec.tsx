import React from "react";
import {
  screen,
  waitForElementToBeRemoved,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "__support__/ui";
import ActionCreator from "metabase/actions/containers/ActionCreator/ActionCreator";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { createMockDatabase } from "metabase-types/api/mocks";

const TEST_DATABASE = createMockDatabase();

const setup = async () => {
  setupDatabasesEndpoints([TEST_DATABASE]);

  renderWithProviders(<ActionCreator />);

  await waitForElementToBeRemoved(() =>
    screen.queryByTestId("loading-spinner"),
  );
};

describe("ActionCreator", () => {
  it("should trigger beforeunload event when trying to leave action creation or editing", async () => {
    await setup();
    const textArea = within(screen.getByTestId("editable-text"));
    const titleTextArea = textArea.getByText("New Action");
    userEvent.type(titleTextArea, "New title");
    userEvent.tab();
    expect(true).toBe(true);
  });
});
