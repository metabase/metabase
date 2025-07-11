import userEvent from "@testing-library/user-event";

import {
  setupActionsEndpoints,
  setupCardsEndpoints,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { MockDashboardContext } from "metabase/public/containers/PublicOrEmbeddedDashboard/mock-context";
import type { DashCardId } from "metabase-types/api";
import {
  createMockActionDashboardCard,
  createMockCard,
  createMockCollectionItem,
  createMockDashboard,
  createMockDashboardCard,
  createMockDatabase,
  createMockQueryAction,
} from "metabase-types/api/mocks";

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

const setup = ({
  dashcardId = actionDashcard.id,
}: {
  dashcardId?: DashCardId;
} = {}) => {
  setupDatabasesEndpoints([actionsDatabase]);
  setupSearchEndpoints([collectionItem]);
  setupActionsEndpoints([]);
  setupCardsEndpoints([modelCard]);

  const vizUpdateSpy = jest.fn();
  const closeSpy = jest.fn();

  renderWithProviders(
    <MockDashboardContext
      dashboardId={dashboard.id}
      dashboard={dashboard}
      sidebar={{
        props: { dashcardId },
      }}
      onUpdateDashCardVisualizationSettings={vizUpdateSpy as any}
      closeSidebar={closeSpy}
      navigateToNewCardFromDashboard={null}
    >
      <ActionSidebar />
    </MockDashboardContext>,
  );

  return { vizUpdateSpy, closeSpy };
};

const navigateToActionCreatorModal = async () => {
  await userEvent.click(screen.getByText("Pick an action"));
  await screen.findByTestId("action-dashcard-settings");
  await waitForLoaderToBeRemoved();
  await userEvent.click(screen.getByText(collectionItem.name));
  await userEvent.click(screen.getByText("Create new action"));
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
    await userEvent.clear(textInput);
    await userEvent.type(textInput, "xyz");

    await waitFor(() =>
      expect(vizUpdateSpy).toHaveBeenLastCalledWith(actionDashcard.id, {
        "button.label": "xyz",
      }),
    );
  });

  it("can change the button variant", async () => {
    const { vizUpdateSpy } = setup();

    const dropdown = screen.getByLabelText("Button variant");

    expect(screen.getByDisplayValue("Primary")).toBeInTheDocument();
    await userEvent.click(dropdown);
    await userEvent.click(screen.getByText("Danger"));

    await waitFor(() =>
      expect(vizUpdateSpy).toHaveBeenLastCalledWith(actionDashcard.id, {
        "button.variant": "danger",
      }),
    );
  });

  it("closes when you click the close button", async () => {
    const { closeSpy } = setup();

    const closeButton = screen.getByRole("button", { name: "Close" });
    await userEvent.click(closeButton);

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

      await userEvent.click(document.body);

      const mockNativeQueryEditor = screen.getByTestId(
        "mock-native-query-editor",
      );

      expect(mockNativeQueryEditor).toBeInTheDocument();
    });

    it("should close modal when clicking 'Cancel'", async () => {
      setup();
      await navigateToActionCreatorModal();

      const cancelButton = screen.getByRole("button", { name: "Cancel" });

      await userEvent.click(cancelButton);

      await waitFor(() =>
        expect(
          screen.queryByTestId("mock-native-query-editor"),
        ).not.toBeInTheDocument(),
      );
    });
  });
});
