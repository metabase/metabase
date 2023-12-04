import type * as React from "react";
import userEvent from "@testing-library/user-event";
import {
  screen,
  waitFor,
  renderWithProviders,
  waitForLoaderToBeRemoved,
} from "__support__/ui";

import {
  createMockDashboard,
  createMockActionDashboardCard,
  createMockDashboardCard,
  createMockQueryAction,
  createMockCard,
  createMockDatabase,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import {
  setupActionsEndpoints,
  setupCardsEndpoints,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { ActionSidebar } from "./ActionSidebar";

const dashcard = createMockDashboardCard();
const actionDashcard = createMockActionDashboardCard({ id: 2 });
const actionDashcardWithAction = createMockActionDashboardCard({
  id: 3,
  action: createMockQueryAction(),
});

const collectionItem = createMockCollectionItem({
  model: "dataset",
});
const modelCard = createMockCard();
const actionsDatabase = createMockDatabase({
  settings: { "database-enable-actions": true },
});
const dashboard = createMockDashboard({
  dashcards: [dashcard, actionDashcard, actionDashcardWithAction],
});

const setup = (
  options?: Partial<React.ComponentProps<typeof ActionSidebar>>,
) => {
  setupDatabasesEndpoints([actionsDatabase]);
  setupSearchEndpoints([collectionItem]);
  setupActionsEndpoints([]);
  setupCardsEndpoints([modelCard]);

  const vizUpdateSpy = jest.fn();
  const closeSpy = jest.fn();

  renderWithProviders(
    <ActionSidebar
      onUpdateVisualizationSettings={vizUpdateSpy}
      onClose={closeSpy}
      dashboard={dashboard}
      dashcardId={actionDashcard.id}
      {...options}
    />,
  );

  return { vizUpdateSpy, closeSpy };
};

const navigateToActionCreatorModal = async () => {
  userEvent.click(screen.getByText("Pick an action"));
  await waitForLoaderToBeRemoved();
  userEvent.click(screen.getByText(collectionItem.name));
  userEvent.click(screen.getByText("Create new action"));
  await waitForLoaderToBeRemoved();
};

describe("Dashboard > ActionSidebar", () => {
  it("shows an action sidebar with text and variant form fields", () => {
    setup();

    expect(screen.getByText("Button properties")).toBeInTheDocument();
    expect(screen.getByLabelText("Button text")).toBeInTheDocument();
    expect(screen.getByLabelText("Button variant")).toBeInTheDocument();
  });

  it("can update button text", async () => {
    const { vizUpdateSpy } = setup();

    const textInput = screen.getByLabelText("Button text");

    expect(textInput).toHaveValue(
      actionDashcard.visualization_settings["button.label"] as string,
    );
    userEvent.clear(textInput);
    userEvent.type(textInput, "xyz");

    await waitFor(() =>
      expect(vizUpdateSpy).toHaveBeenLastCalledWith({ "button.label": "xyz" }),
    );
  });

  it("can change the button variant", async () => {
    const { vizUpdateSpy } = setup();

    const dropdown = screen.getByLabelText("Button variant");

    expect(screen.getByText("Primary")).toBeInTheDocument();
    userEvent.click(dropdown);
    userEvent.click(screen.getByText("Danger"));

    await waitFor(() =>
      expect(vizUpdateSpy).toHaveBeenLastCalledWith({
        "button.variant": "danger",
      }),
    );
  });

  it("closes when you click the close button", async () => {
    const { closeSpy } = setup();

    const closeButton = screen.getByRole("button", { name: "Close" });
    userEvent.click(closeButton);

    await waitFor(() => expect(closeSpy).toHaveBeenCalledTimes(1));
  });

  it("changes the modal trigger button when an action is assigned already", async () => {
    setup({ dashcardId: 3 });

    expect(screen.getByText("Change action")).toBeInTheDocument();
  });

  describe("ActionCreator Modal", () => {
    it("should not close modal on outside click", async () => {
      setup();
      await navigateToActionCreatorModal();

      userEvent.click(document.body);

      const mockNativeQueryEditor = screen.getByTestId(
        "mock-native-query-editor",
      );

      expect(mockNativeQueryEditor).toBeInTheDocument();
    });

    it("should close modal when clicking 'Cancel'", async () => {
      setup();
      await navigateToActionCreatorModal();

      const cancelButton = screen.getByRole("button", { name: "Cancel" });

      userEvent.click(cancelButton);

      expect(
        screen.queryByTestId("mock-native-query-editor"),
      ).not.toBeInTheDocument();
    });
  });
});
