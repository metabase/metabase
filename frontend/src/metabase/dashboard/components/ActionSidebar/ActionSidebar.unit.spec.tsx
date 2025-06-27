import userEvent from "@testing-library/user-event";
import type * as React from "react";

import {
  setupActionsEndpoints,
  setupCardsEndpoints,
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
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
      expect(vizUpdateSpy).toHaveBeenLastCalledWith({ "button.label": "xyz" }),
    );
  });

  it("can change the button variant", async () => {
    const { vizUpdateSpy } = setup();

    const dropdown = screen.getByLabelText("Button variant");

    expect(screen.getByText("Primary")).toBeInTheDocument();
    await userEvent.click(dropdown);
    await userEvent.click(screen.getByText("Danger"));

    await waitFor(() =>
      expect(vizUpdateSpy).toHaveBeenLastCalledWith({
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

    expect(screen.getByText("Change")).toBeInTheDocument();
  });
});
