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
import { callMockEvent } from "__support__/events";
import { BEFORE_UNLOAD_UNSAVED_MESSAGE } from "metabase/hooks/use-before-unload";

const TEST_DATABASE = createMockDatabase();

const setup = async () => {
  setupDatabasesEndpoints([TEST_DATABASE]);

  renderWithProviders(<ActionCreator />);

  const mockEventListener = jest.spyOn(window, "addEventListener");

  await waitForElementToBeRemoved(() =>
    screen.queryByTestId("loading-spinner"),
  );

  return {
    mockEventListener,
  };
};

describe("ActionCreator", () => {
  it("should trigger beforeunload event when trying to navigate away from editing or creating an action", async () => {
    const { mockEventListener } = await setup();
    const textArea = within(screen.getByTestId("editable-text"));
    const titleTextArea = textArea.getByText("New Action");
    userEvent.type(titleTextArea, "New title");
    userEvent.tab();
    const mockEvent = callMockEvent(mockEventListener, "beforeunload");
    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockEvent.returnValue).toBe(BEFORE_UNLOAD_UNSAVED_MESSAGE);
  });

  it("should not trigger beforeunload event when navigating away and the action is unedited", async () => {
    const { mockEventListener } = await setup();

    const mockEvent = callMockEvent(mockEventListener, "beforeunload");
    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockEvent.returnValue).toBe(BEFORE_UNLOAD_UNSAVED_MESSAGE);
  });
});
