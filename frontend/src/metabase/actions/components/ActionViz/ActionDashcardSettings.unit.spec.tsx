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

import { WritebackParameter } from "metabase-types/api";
import { ConnectedActionDashcardSettings } from "./ActionDashcardSettings";

const dashboardParameter = createMockParameter({
  id: "dash-param-id",
  name: "Dashboard Parameter",
  slug: "dashboard-parameter",
});

const actionParameter1 = createActionParameter(1);
const actionParameter2 = createActionParameter(2);
const actionParameterRequired = createActionParameter(3, { required: true });

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

const dashcard = createMockDashboardOrderedCard();
const actionDashcard = createMockActionDashboardCard({ id: 2 });
const actionDashcardWithAction = createMockActionDashboardCard({
  id: 3,
  action: actions2[2],
});

const dashboard = createMockDashboard({
  ordered_cards: [dashcard, actionDashcard, actionDashcardWithAction],
  parameters: [dashboardParameter],
});

const DEFAULT_VALUE = "default value";

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
  describe("when there are required, hidden and mapped parameters", () => {
    const action = {
      ...actions1[0],
      parameters: [actionParameter1, actionParameterRequired],
      visualization_settings: {
        fields: {
          [actionParameter1.id]: createMockFieldSettings({
            id: actionParameter1.id,
            hidden: false,
          }),
          [actionParameterRequired.id]: createMockFieldSettings({
            id: actionParameterRequired.id,
            hidden: true,
          }),
        },
      },
    };

    const dashcard = {
      ...actionDashcardWithAction,
      action,
      parameter_mappings: action.parameters.map(parameter => ({
        parameter_id: dashboardParameter.id,
        target: parameter.target,
      })),
    };

    beforeEach(() => {
      setup({
        dashcard,
      });
    });

    it("doesn't show a hidden badge for not hidden field", () => {
      const formSection = screen.getByTestId(
        `parameter-form-section-${actionParameter1.id}`,
      );

      expect(within(formSection).queryByText("Hidden")).not.toBeInTheDocument();
    });

    it("shows a hidden badge for hidden field", () => {
      const formSection = screen.getByTestId(
        `parameter-form-section-${actionParameterRequired.id}`,
      );

      expect(within(formSection).getByText("Hidden")).toBeInTheDocument();
    });

    it("doesn't show validation error for not required field", () => {
      const formSection = screen.getByTestId(
        `parameter-form-section-${actionParameterRequired.id}`,
      );

      expect(
        within(formSection).queryByText(
          `${actionParameterRequired.name}: required`,
        ),
      ).not.toBeInTheDocument();
    });

    it("allows to submit a form", () => {
      expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
    });
  });

  describe("when there are required, hidden, but not mapped parameters", () => {
    const action = createMockQueryAction({
      ...actions1[0],
      parameters: [actionParameter1, actionParameterRequired],
      visualization_settings: {
        fields: {
          [actionParameter1.id]: createMockFieldSettings({
            id: actionParameter1.id,
            hidden: false,
          }),
          [actionParameterRequired.id]: createMockFieldSettings({
            id: actionParameterRequired.id,
            hidden: true,
          }),
        },
      },
    });

    const dashcard = {
      ...actionDashcardWithAction,
      action: action,
    };

    beforeEach(() => {
      setup({
        dashcard: dashcard,
      });
    });

    it("doesn't show a hidden badge for not hidden field", () => {
      const formSection = screen.getByTestId(
        `parameter-form-section-${actionParameter1.id}`,
      );

      expect(within(formSection).queryByText("Hidden")).not.toBeInTheDocument();
    });

    it("shows a hidden badge for hidden field", () => {
      const formSection = screen.getByTestId(
        `parameter-form-section-${actionParameterRequired.id}`,
      );

      expect(within(formSection).getByText("Hidden")).toBeInTheDocument();
    });

    it("shows validation error for not required field", () => {
      const formSection = screen.getByTestId(
        `parameter-form-section-${actionParameterRequired.id}`,
      );

      expect(
        within(formSection).getByText(
          `${actionParameterRequired.name}: required`,
        ),
      ).toBeInTheDocument();
    });

    it("doesn't allow to submit a form", () => {
      expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
    });

    it("shows a placeholder text to select a value", () => {
      const formSection = screen.getByTestId(
        `parameter-form-section-${actionParameterRequired.id}`,
      );

      expect(within(formSection).getByRole("button")).toHaveTextContent(
        "Select a value",
      );
    });
  });

  describe.each([
    [
      "not required, not hidden, mapped",
      dashcardFactory({
        hidden: false,
        required: false,
        mapped: true,
        defaultValue: DEFAULT_VALUE,
      }),
    ],
    [
      "required, not hidden, not mapped",
      dashcardFactory({
        hidden: false,
        required: true,
        mapped: false,
        defaultValue: DEFAULT_VALUE,
      }),
    ],
    [
      "not required, not hidden, not mapped",
      dashcardFactory({
        hidden: false,
        required: false,
        mapped: false,
        defaultValue: DEFAULT_VALUE,
      }),
    ],
  ])("when there is default value and %s", (_, getDashcard) => {
    beforeEach(() => {
      setup({
        dashcard: getDashcard(),
      });
    });

    it("puts default value to the select", async () => {
      const formSection = screen.getByTestId(
        `parameter-form-section-${actionParameter1.id}`,
      );

      userEvent.click(within(formSection).getByTestId("select-button"));

      const popover = await screen.findByRole("grid");
      expect(within(popover).getByText(DEFAULT_VALUE)).toBeInTheDocument();
    });
  });

  describe.each([
    [
      "not required, not hidden, mapped",
      dashcardFactory({ hidden: false, required: false, mapped: true }),
    ],
    [
      "required, not hidden, not mapped",
      dashcardFactory({ hidden: false, required: true, mapped: false }),
    ],
    [
      "not required, not hidden, not mapped",
      dashcardFactory({ hidden: false, required: false, mapped: false }),
    ],
  ])("when parameter %s", (_, getDashcard) => {
    beforeEach(() => {
      setup({
        dashcard: getDashcard(),
      });
    });

    it("doesn't show a hidden badge for not hidden field", () => {
      const formSection = screen.getByTestId(
        `parameter-form-section-${actionParameter1.id}`,
      );

      expect(within(formSection).queryByText("Hidden")).not.toBeInTheDocument();
    });

    it("doesn't show validation error for not required field", () => {
      const formSection = screen.getByTestId(
        `parameter-form-section-${actionParameter1.id}`,
      );

      expect(
        within(formSection).queryByText(`${actionParameter1.name}: required`),
      ).not.toBeInTheDocument();
    });

    it("allows to submit a form", () => {
      expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
    });

    it("doesn't contain default", async () => {
      const formSection = screen.getByTestId(
        `parameter-form-section-${actionParameter1.id}`,
      );

      userEvent.click(within(formSection).getByTestId("select-button"));

      const popover = await screen.findByRole("grid");
      expect(
        within(popover).queryByText(DEFAULT_VALUE),
      ).not.toBeInTheDocument();
    });
  });

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

  it("can close the modal with the done button", () => {
    const { closeSpy } = setup();

    userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});

function createActionParameter(
  id: number,
  options: Partial<WritebackParameter> = {},
) {
  return createMockActionParameter({
    id: `action-param-id-${id}`,
    name: `Action Parameter ${id}`,
    slug: `action-parameter-${id}`,
    target: ["variable", ["template-tag", `action-parameter-${id}`]],
    ...options,
  });
}

function dashcardFactory({
  required,
  hidden,
  mapped,
  defaultValue,
}: {
  required: boolean;
  hidden: boolean;
  mapped: boolean;
  defaultValue?: string;
}) {
  const action = {
    ...actions1[0],
    parameters: [actionParameter1],
    visualization_settings: {
      fields: {
        [actionParameter1.id]: createMockFieldSettings({
          id: actionParameter1.id,
          hidden,
          required,
          defaultValue,
        }),
      },
    },
  };

  const dashcard = {
    ...actionDashcardWithAction,
    action: action,
    parameter_mappings: mapped
      ? action.parameters.map(parameter => ({
          parameter_id: dashboardParameter.id,
          target: parameter.target,
        }))
      : [],
  };

  return () => dashcard;
}
