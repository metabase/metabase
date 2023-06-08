import * as React from "react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, within } from "__support__/ui";

import {
  setupActionsEndpoints,
  setupCardsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";

import {
  createMockDashboard,
  createMockActionDashboardCard,
  createMockDashboardOrderedCard,
  createMockQueryAction,
  createMockCard,
  createMockParameter,
  createMockActionParameter,
  createMockCollectionItem,
  createMockFieldSettings,
} from "metabase-types/api/mocks";

import { ConnectedActionDashcardSettings } from "./ActionDashcardSettings";

const dashboardParameter = createMockParameter({
  id: "dash-param-id",
  name: "Dashboard Parameter",
  slug: "dashboard-parameter",
});

const actionParameter1 = createMockActionParameter({
  id: "action-param-id-1",
  name: "Action Parameter 1",
  slug: "action-parameter-1",
  target: ["variable", ["template-tag", "action-parameter-1"]],
});
const actionParameter2 = createMockActionParameter({
  id: "action-param-id-2",
  name: "Action Parameter 2",
  slug: "action-parameter-2",
  target: ["variable", ["template-tag", "action-parameter-2"]],
});
const actionParameter3 = createMockActionParameter({
  id: "action-param-id-3",
  name: "Action Parameter 3",
  slug: "action-parameter-3",
  target: ["variable", ["template-tag", "action-parameter-3"]],
  required: true,
});

const models = [
  createMockCard({ id: 1, name: "Model Uno", dataset: true }),
  createMockCard({ id: 2, name: "Model Deux", dataset: true }),
];

const actions1 = [
  createMockQueryAction({ id: 1, name: "Action Uno", model_id: models[0].id }),
  createMockQueryAction({ id: 2, name: "Action Dos", model_id: models[0].id }),
  createMockQueryAction({ id: 3, name: "Action Tres", model_id: models[0].id }),
];

const actions2 = [
  createMockQueryAction({ id: 11, name: "Action Un", model_id: models[1].id }),
  createMockQueryAction({
    id: 12,
    name: "Action Deux",
    model_id: models[1].id,
  }),
  createMockQueryAction({
    id: 13,
    name: "Action Trois",
    model_id: models[1].id,
    parameters: [actionParameter1, actionParameter2],
  }),
];

const actionWithHiddenFields = createMockQueryAction({
  id: 14,
  name: "Action Trois 14",
  model_id: models[1].id,
  parameters: [actionParameter1, actionParameter2, actionParameter3],
  visualization_settings: {
    fields: {
      [actionParameter1.id]: createMockFieldSettings({
        id: actionParameter1.id,
        hidden: false,
      }),
      [actionParameter2.id]: createMockFieldSettings({
        id: actionParameter2.id,
        hidden: true,
      }),
      [actionParameter3.id]: createMockFieldSettings({
        id: actionParameter3.id,
        hidden: true,
      }),
    },
  },
});

const dashcard = createMockDashboardOrderedCard();
const actionDashcard = createMockActionDashboardCard({ id: 2 });
const actionDashcardWithAction = createMockActionDashboardCard({
  id: 3,
  action: actions2[2],
});
const actionDashcardWithActionWithHiddenFields = createMockActionDashboardCard({
  id: 4,
  action: actionWithHiddenFields,
});

const dashboard = createMockDashboard({
  ordered_cards: [
    dashcard,
    actionDashcard,
    actionDashcardWithAction,
    actionDashcardWithActionWithHiddenFields,
  ],
  parameters: [dashboardParameter],
});

const setup = (
  options?: Partial<
    React.ComponentProps<typeof ConnectedActionDashcardSettings>
  >,
) => {
  const searchItems = models.map(model =>
    createMockCollectionItem({ ...model, model: "dataset" }),
  );
  const closeSpy = jest.fn();

  setupSearchEndpoints(searchItems);
  setupCardsEndpoints(models);
  setupActionsEndpoints([...actions1, ...actions2]);

  renderWithProviders(
    <ConnectedActionDashcardSettings
      onClose={closeSpy}
      dashboard={dashboard}
      dashcard={actionDashcard}
      {...options}
    />,
  );

  return { closeSpy };
};

describe("ActionViz > ActionDashcardSettings", () => {
  it("shows the action dashcard settings component", () => {
    setup();

    expect(screen.getByText("Action Library")).toBeInTheDocument();
    expect(screen.getByText(/Select an action/i)).toBeInTheDocument();
  });

  it("loads the model list", async () => {
    setup();

    expect(screen.getByText("Action Library")).toBeInTheDocument();
    await screen.findByText("Model Uno");
    await screen.findByText("Model Deux");
  });

  it("shows actions within their respective models", async () => {
    setup();

    const modelExpander = await screen.findByText("Model Uno");

    expect(screen.queryByText("Action Uno")).not.toBeInTheDocument();

    userEvent.click(modelExpander);

    await screen.findByText("Action Uno");
    expect(screen.getByText("Action Uno")).toBeInTheDocument();
    expect(screen.getByText("Action Dos")).toBeInTheDocument();
  });

  it("shows the action assigned to a dashcard", async () => {
    setup({
      dashcard: actionDashcardWithAction,
    });

    // action name should be visible in library and parameter mapper
    expect(await screen.findByText("Action Trois")).toBeInTheDocument();
    expect(
      await screen.findByText(/the values for 'Action Trois'/i),
    ).toBeInTheDocument();
  });

  it("shows parameters for an action", async () => {
    setup({
      dashcard: actionDashcardWithAction,
    });
    expect(screen.getByText("Action Parameter 1")).toBeInTheDocument();
    expect(screen.getByText("Action Parameter 2")).toBeInTheDocument();
  });

  describe("when parameter is hidden, required and not mapped", () => {
    it("shows hidden badge for a hidden field", () => {
      setup({
        dashcard: actionDashcardWithActionWithHiddenFields,
      });

      const formSection = screen.getByTestId(
        `parameter-form-section-${actionParameter3.id}`,
      );

      expect(formSection).toBeInTheDocument();
      expect(
        within(formSection).getByText("Action Parameter 3: required"),
      ).toBeInTheDocument();
      expect(within(formSection).getByText("Hidden")).toBeInTheDocument();
      expect(within(formSection).getByRole("button")).toHaveTextContent(
        "Select a value",
      );
    });

    it("doesn't allow to submit a form", () => {
      setup({
        dashcard: actionDashcardWithActionWithHiddenFields,
      });

      expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
    });
  });

  it("can close the modal with the done button", () => {
    const { closeSpy } = setup();

    userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
