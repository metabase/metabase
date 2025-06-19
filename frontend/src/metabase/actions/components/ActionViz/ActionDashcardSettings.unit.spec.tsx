import userEvent from "@testing-library/user-event";
import type * as React from "react";

import { renderWithProviders, screen, within } from "__support__/ui";
import { Modal } from "metabase/ui";
import type { WritebackParameter } from "metabase-types/api";
import {
  createMockActionDashboardCard,
  createMockActionParameter,
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockFieldSettings,
  createMockParameter,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import { ActionDashcardSettings } from "./ActionDashcardSettings";

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

const dashcard = createMockDashboardCard();
const actionDashcard = createMockActionDashboardCard({ id: 2 });
const action = actions2[2];
const actionDashcardWithAction = createMockActionDashboardCard({
  id: 3,
  action: action,
});

const dashboard = createMockDashboard({
  dashcards: [dashcard, actionDashcard, actionDashcardWithAction],
  parameters: [dashboardParameter],
});

const DEFAULT_VALUE = "default value";

const setup = (
  options?: Partial<React.ComponentProps<typeof ActionDashcardSettings>>,
) => {
  const closeSpy = jest.fn();
  const onChooseNewActionSpy = jest.fn();

  renderWithProviders(
    <Modal.Root opened onClose={closeSpy}>
      <ActionDashcardSettings
        action={action}
        dashboard={dashboard}
        dashcard={actionDashcard}
        onChooseNewAction={onChooseNewActionSpy}
        onClose={closeSpy}
        {...options}
      />
    </Modal.Root>,
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

        const dashcard = getDashcard();

        setup({
          action: dashcard.action,
          dashcard: dashcard,
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

      const dashcard = getDashcard();

      setup({
        action: dashcard.action,
        dashcard: dashcard,
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

      const dashcard = getDashcard();

      setup({
        action: dashcard.action,
        dashcard: dashcard,
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

        const dashcard = getDashcard();

        setup({
          action: dashcard.action,
          dashcard: dashcard,
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

        const dashcard = getDashcard();

        setup({
          action: dashcard.action,
          dashcard: dashcard,
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
        action: action,
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

  it("shows the action assigned to a dashcard", async () => {
    setup({
      dashcard: actionDashcardWithAction,
      action: action,
    });

    expect(
      await screen.findByText(/the values for 'Action Trois'/i),
    ).toBeInTheDocument();
  });

  it("should be valid and not crash when the action does not have parameters (metabase#32665)", async () => {
    const action = createMockQueryAction();
    const { closeSpy } = setup({
      dashcard: createMockActionDashboardCard({
        action,
      }),
      action,
    });
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(closeSpy).toHaveBeenCalled();
  });

  it("shows parameters for an action", async () => {
    setup({
      dashcard: actionDashcardWithAction,
    });
    expect(screen.getByText("Action Parameter 1")).toBeInTheDocument();
    expect(screen.getByText("Action Parameter 2")).toBeInTheDocument();
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
      ? action.parameters.map((parameter) => ({
          parameter_id: dashboardParameter.id,
          target: parameter.target,
        }))
      : [],
  };

  return () => dashcard;
}
