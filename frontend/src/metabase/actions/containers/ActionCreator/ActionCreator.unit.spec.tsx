import React from "react";
import {
  screen,
  waitForElementToBeRemoved,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "__support__/ui";
import ActionCreator from "metabase/actions/containers/ActionCreator/ActionCreator";
import {
  setupCardsEndpoints,
  setupDatabasesEndpoints,
  setupModelActionsEndpoints,
} from "__support__/server-mocks";
import {
  createMockCard,
  createMockDatabase,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";
import { callMockEvent } from "__support__/events";
import { BEFORE_UNLOAD_UNSAVED_MESSAGE } from "metabase/hooks/use-before-unload";
import { createEmptyWritebackAction } from "metabase/actions/containers/ActionCreator/ActionContext/utils";

const TEST_DATABASE_ID = 1;
const TEST_CARD_ID = 1;
const TEST_ACTION_ID = 1;

const TEST_DATABASE = createMockDatabase({
  settings: {
    "database-enable-actions": true,
  },
});
const TEST_ACTION = createEmptyWritebackAction({
  id: TEST_ACTION_ID,
  model_id: TEST_CARD_ID,
  name: "New Action",
  database_id: null,
});

const TEST_CARD = createMockCard({
  id: 1,
  database_id: TEST_DATABASE_ID,
  dataset: true,
  dataset_query: createMockNativeDatasetQuery(),
  can_write: true,
});

const setup = async () => {
  setupDatabasesEndpoints([TEST_DATABASE]);
  setupCardsEndpoints([TEST_CARD]);
  setupModelActionsEndpoints([TEST_ACTION], TEST_CARD.id);

  renderWithProviders(
    <ActionCreator
      actionId={TEST_ACTION.id}
      modelId={TEST_CARD.id}
      databaseId={null}
    />,
  );

  const mockEventListener = jest.spyOn(window, "addEventListener");

  await waitForElementToBeRemoved(() =>
    screen.queryByTestId("loading-spinner"),
  );

  return {
    mockEventListener,
  };
};

describe("ActionCreator", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("should trigger beforeunload event when trying to navigate away from editing or creating an action", async () => {
    const { mockEventListener } = await setup();
    const textArea = within(screen.getByTestId("editable-text"));

    const titleTextArea = textArea.getByRole("textbox");
    userEvent.type(titleTextArea, "New title");
    userEvent.tab();
    const mockEvent = callMockEvent(mockEventListener, "beforeunload");
    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockEvent.returnValue).toBe(BEFORE_UNLOAD_UNSAVED_MESSAGE);
  });

  it("should not trigger beforeunload event when navigating away and the action is unedited", async () => {
    const { mockEventListener } = await setup();

    const mockEvent = callMockEvent(mockEventListener, "beforeunload");
    expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    expect(mockEvent.returnValue).not.toBe(BEFORE_UNLOAD_UNSAVED_MESSAGE);
  });
});
