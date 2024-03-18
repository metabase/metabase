import userEvent from "@testing-library/user-event";
import type * as React from "react";

import {
  setupActionsEndpoints,
  setupCardsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import type { WritebackParameter } from "metabase-types/api";
import {
  createMockDashboard,
  createMockActionDashboardCard,
  createMockDashboardCard,
  createMockQueryAction,
  createMockCard,
  createMockParameter,
  createMockActionParameter,
  createMockCollectionItem,
  createMockFieldSettings,
  createMockImplicitCUDActions,
} from "metabase-types/api/mocks";

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
  createMockCard({ id: 1, name: "Model Uno", type: "model" }),
  createMockCard({ id: 2, name: "Model Deux", type: "model" }),
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

const implicitActions = createMockImplicitCUDActions(models[1].id, 123);

const dashcard = createMockDashboardCard();
const actionDashcard = createMockActionDashboardCard({ id: 2 });
const actionDashcardWithAction = createMockActionDashboardCard({
  id: 3,
  action: actions2[2],
});

const dashboard = createMockDashboard({
  dashcards: [dashcard, actionDashcard, actionDashcardWithAction],
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
  setupActionsEndpoints([...actions1, ...actions2, ...implicitActions]);

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
  describe.each([
    { required: true, mapped: true, hasDefaultValue: true },
    { required: true, mapped: true, hasDefaultValue: false },
    { required: true, mapped: false, hasDefaultValue: true },
    { required: true, mapped: false, hasDefaultValue: false },
    { required: false, mapped: true, hasDefaultValue: true },
    { required: false, mapped: true, hasDefaultValue: false },
    { required: false, mapped: false, hasDefaultValue: true },
    { required: false, mapped: false, hasDefaultValue: false },
  ])(
    "when not hidden, required: $required, mapped: $mapped, hasDefaultValue: $hasDefaultValue",
    ({ required, mapped, hasDefaultValue }) => {
      beforeEach(() => {
        const getDashcard = dashcardFactory({
          required,
          mapped,
          hasDefaultValue,
          hidden: false,
        });

        setup({
          dashcard: getDashcard(),
        });
      });

      it("doesn't show a hidden badge for not hidden field", () => {
        const formSection = screen.getByTestId(
          `parameter-form-section-${actionParameter1.id}`,
        );

        expect(
          within(formSection).queryByText("Hidden"),
        ).not.toBeInTheDocument();
      });

      it("doesn't show validation error", () => {
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

      it("populates popover properly", async () => {
        const formSection = screen.getByTestId(
          `parameter-form-section-${actionParameter1.id}`,
        );

        await userEvent.click(within(formSection).getByTestId("select-button"));

        const popover = await screen.findByRole("grid");

        expect(
          within(popover).getByText(dashboardParameter.name),
        ).toBeInTheDocument();
        expect(within(popover).getByText("Ask the user")).toBeInTheDocument();
      });
    },
  );

  describe.each([
    { required: true, mapped: true, hasDefaultValue: true },
    { required: true, mapped: true, hasDefaultValue: false },
    { required: true, mapped: false, hasDefaultValue: true },
    { required: true, mapped: false, hasDefaultValue: false },
    { required: false, mapped: true, hasDefaultValue: true },
    { required: false, mapped: true, hasDefaultValue: false },
    { required: false, mapped: false, hasDefaultValue: true },
    { required: false, mapped: false, hasDefaultValue: false },
  ])(
    "when hidden, required: $required, mapped: $mapped, hasDefaultValue: $hasDefaultValue",
    ({ required, mapped, hasDefaultValue }) => {
      beforeEach(() => {
        const getDashcard = dashcardFactory({
          required,
          mapped,
          hasDefaultValue,
          hidden: true,
        });

        setup({
          dashcard: getDashcard(),
        });
      });

      it("shows a hidden badge", () => {
        const formSection = screen.getByTestId(
          `parameter-form-section-${actionParameter1.id}`,
        );

        expect(within(formSection).getByText("Hidden")).toBeInTheDocument();
      });

      it("populates popover properly", async () => {
        const formSection = screen.getByTestId(
          `parameter-form-section-${actionParameter1.id}`,
        );

        await userEvent.click(within(formSection).getByTestId("select-button"));

        const popover = await screen.findByRole("grid");

        expect(
          within(popover).queryByText("Ask the user"),
        ).not.toBeInTheDocument();
      });
    },
  );

  describe("when hidden, required, but not mapped and no default value", () => {
    beforeEach(() => {
      const getDashcard = dashcardFactory({
        required: true,
        mapped: false,
        hasDefaultValue: false,
        hidden: true,
      });

      setup({
        dashcard: getDashcard(),
      });
    });

    it("doesn't allow to submit a form", () => {
      expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
    });

    it("shows validation error for not required field", () => {
      const formSection = screen.getByTestId(
        `parameter-form-section-${actionParameter1.id}`,
      );

      expect(
        within(formSection).getByText(`${actionParameter1.name}: required`),
      ).toBeInTheDocument();
    });
  });

  describe("when hidden, required, has default value, but not mapped", () => {
    beforeEach(() => {
      const getDashcard = dashcardFactory({
        required: true,
        mapped: false,
        hasDefaultValue: true,
        hidden: true,
      });

      setup({
        dashcard: getDashcard(),
      });
    });

    it("populates popover properly", async () => {
      const formSection = screen.getByTestId(
        `parameter-form-section-${actionParameter1.id}`,
      );

      await userEvent.click(within(formSection).getByTestId("select-button"));

      const popover = await screen.findByRole("grid");

      expect(within(popover).getByText("Select a value")).toBeInTheDocument();
      expect(within(popover).getByText(DEFAULT_VALUE)).toBeInTheDocument();
      expect(
        within(popover).queryByText("Ask the user"),
      ).not.toBeInTheDocument();
      expect(
        within(popover).getByText(dashboardParameter.name),
      ).toBeInTheDocument();
    });
  });

  describe.each([
    { required: true, mapped: true },
    { required: true, mapped: false },
    { required: false, mapped: true },
    { required: false, mapped: false },
  ])(
    "when hidden and has default value, required: $required, mapped: $mapped",
    ({ required, mapped }) => {
      beforeEach(() => {
        const getDashcard = dashcardFactory({
          required,
          mapped,
          hasDefaultValue: true,
          hidden: true,
        });

        setup({
          dashcard: getDashcard(),
        });
      });

      it("populates popover properly", async () => {
        const formSection = screen.getByTestId(
          `parameter-form-section-${actionParameter1.id}`,
        );

        await userEvent.click(within(formSection).getByTestId("select-button"));

        const popover = await screen.findByRole("grid");

        expect(
          within(popover).queryByText("Ask the user"),
        ).not.toBeInTheDocument();
      });

      it("allows to submit a form", () => {
        expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
      });
    },
  );

  describe.each([{ required: true }, { required: false }])(
    "when hidden, mapped but no default value, required: $required",
    ({ required }) => {
      beforeEach(() => {
        const getDashcard = dashcardFactory({
          required,
          mapped: true,
          hasDefaultValue: false,
          hidden: true,
        });

        setup({
          dashcard: getDashcard(),
        });
      });

      it("populates popover properly", async () => {
        const formSection = screen.getByTestId(
          `parameter-form-section-${actionParameter1.id}`,
        );

        await userEvent.click(within(formSection).getByTestId("select-button"));

        const popover = await screen.findByRole("grid");

        expect(within(popover).getByText("Select a value")).toBeInTheDocument();
        expect(
          within(popover).queryByText("Ask the user"),
        ).not.toBeInTheDocument();
      });
    },
  );

  describe("when there are required, hidden, but not mapped parameters and no default value", () => {
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

    await userEvent.click(modelExpander);

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

  it("supports inline edit for implit and query actions", async () => {
    setup({
      dashcard: actionDashcardWithAction,
    });

    await waitForLoaderToBeRemoved();

    const queryAction = screen.getByTestId(`action-item-${actions2[0].name}`);
    const implicitAction = screen.getByTestId(
      `action-item-${implicitActions[0].name}`,
    );

    expect(queryAction).toBeInTheDocument();
    expect(implicitAction).toBeInTheDocument();

    expect(
      within(queryAction).getByRole("button", { name: "pencil icon" }),
    ).toBeInTheDocument();
    expect(
      within(implicitAction).getByRole("button", { name: "pencil icon" }),
    ).toBeInTheDocument();
  });

  it("can close the modal with the done button", async () => {
    const { closeSpy } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
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
  hasDefaultValue,
}: {
  required: boolean;
  hidden: boolean;
  mapped: boolean;
  hasDefaultValue?: boolean;
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
          defaultValue: hasDefaultValue ? DEFAULT_VALUE : undefined,
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
