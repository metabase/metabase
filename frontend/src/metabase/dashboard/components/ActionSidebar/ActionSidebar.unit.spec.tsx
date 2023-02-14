import React from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "__support__/ui";

import {
  createMockDashboard,
  createMockActionDashboardCard,
  createMockDashboardOrderedCard,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import { ActionSidebarFn } from "./ActionSidebar";

const dashcard = createMockDashboardOrderedCard();
const actionDashcard = createMockActionDashboardCard({ id: 2 });
const actionDashcardWithAction = createMockActionDashboardCard({
  id: 3,
  action: createMockQueryAction(),
});

const dashboard = createMockDashboard({
  ordered_cards: [dashcard, actionDashcard, actionDashcardWithAction],
});

const setup = (
  options?: Partial<React.ComponentProps<typeof ActionSidebarFn>>,
) => {
  const vizUpdateSpy = jest.fn();
  const closeSpy = jest.fn();

  renderWithProviders(
    <ActionSidebarFn
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
});
