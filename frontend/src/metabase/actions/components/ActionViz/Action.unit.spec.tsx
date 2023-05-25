import React from "react";
import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, getIcon, waitFor } from "__support__/ui";
import {
  setupDatabasesEndpoints,
  setupUnauthorizedDatabasesEndpoints,
} from "__support__/server-mocks";

import type { ActionDashboardCard, ParameterTarget } from "metabase-types/api";
import {
  createMockActionDashboardCard as _createMockActionDashboardCard,
  createMockActionParameter,
  createMockFieldSettings,
  createMockQueryAction,
  createMockImplicitQueryAction,
  createMockDashboard,
  createMockDatabase,
} from "metabase-types/api/mocks";

import Action, { ActionProps } from "./Action";

const DASHBOARD_ID = 123;
const DASHCARD_ID = 456;
const ACTION_MODEL_ID = 777;
const ACTION_EXEC_MOCK_PATH = `path:/api/dashboard/${DASHBOARD_ID}/dashcard/${DASHCARD_ID}/execute`;

const DATABASE_WITHOUT_ACTIONS = createMockDatabase({ id: 1 });
const DATABASE = createMockDatabase({
  id: 2,
  settings: { "database-enable-actions": true },
});

const ACTION = createMockQueryAction({
  name: "My Awesome Action",
  database_id: DATABASE.id,
  parameters: [
    createMockActionParameter({
      id: "parameter_1",
      name: "Parameter 1",
      type: "string/=",
      target: ["variable", ["template-tag", "1"]],
    }),
    createMockActionParameter({
      id: "parameter_2",
      name: "Parameter 2",
      type: "number/=",
      target: ["variable", ["template-tag", "2"]],
    }),
  ],
  visualization_settings: {
    fields: {
      parameter_1: createMockFieldSettings({
        fieldType: "string",
        inputType: "string",
      }),
      parameter_2: createMockFieldSettings({
        fieldType: "number",
        inputType: "number",
      }),
    },
  },
});

function createMockActionDashboardCard(
  opts: Partial<ActionDashboardCard> = {},
) {
  return _createMockActionDashboardCard({
    id: DASHCARD_ID,
    card_id: ACTION_MODEL_ID,
    dashboard_id: DASHBOARD_ID,
    action: ACTION,
    parameter_mappings: [
      {
        parameter_id: "dash-param-1",
        target: ["variable", ["template-tag", "1"]],
      },
      {
        parameter_id: "dash-param-2",
        target: ["variable", ["template-tag", "2"]],
      },
    ],
    ...opts,
  });
}

type SetupOpts = Partial<ActionProps> & {
  hasDataPermissions?: boolean;
};

async function setup({
  dashboard = createMockDashboard({ id: DASHBOARD_ID }),
  dashcard = createMockActionDashboardCard(),
  settings = {},
  parameterValues = {},
  hasDataPermissions = true,
  ...props
}: SetupOpts = {}) {
  const databases = [DATABASE, DATABASE_WITHOUT_ACTIONS];

  if (hasDataPermissions) {
    setupDatabasesEndpoints(databases);
    fetchMock.post(ACTION_EXEC_MOCK_PATH, { "rows-updated": [1] });
  } else {
    setupUnauthorizedDatabasesEndpoints(databases);
  }

  renderWithProviders(
    <Action
      dashboard={dashboard}
      dashcard={dashcard}
      settings={settings}
      parameterValues={parameterValues}
      isSettings={false}
      isEditing={false}
      dispatch={jest.fn()}
      onVisualizationClick={jest.fn()}
      {...props}
    />,
  );

  // Wait until UI is ready
  await screen.findByRole("button");
}

describe("Actions > ActionViz > Action", () => {
  describe("Button actions", () => {
    it("should render an empty state for a button with no action", async () => {
      await setup({
        dashcard: createMockActionDashboardCard({ action: undefined }),
      });
      expect(getIcon("bolt")).toBeInTheDocument();
      expect(screen.getByRole("button")).toBeDisabled();
      expect(screen.getByLabelText(/no action assigned/i)).toBeInTheDocument();
    });

    it("should render a disabled state for a button with an action from a database where actions are disabled", async () => {
      await setup({
        dashcard: createMockActionDashboardCard({
          action: createMockQueryAction({
            database_id: DATABASE_WITHOUT_ACTIONS.id,
          }),
        }),
      });
      expect(getIcon("bolt")).toBeInTheDocument();
      expect(screen.getByRole("button")).toBeDisabled();
      expect(
        screen.getByLabelText(/actions are not enabled/i),
      ).toBeInTheDocument();
    });

    it("should render a disabled state if the user doesn't have permissions to action database", async () => {
      await setup({ hasDataPermissions: false });
      expect(getIcon("bolt")).toBeInTheDocument();
      expect(screen.getByRole("button")).toBeDisabled();
      expect(
        screen.getByLabelText(/don't have permission/i),
      ).toBeInTheDocument();
    });

    it("should render an enabled state when the action is valid", async () => {
      await setup();
      expect(screen.getByRole("button")).toBeEnabled();
    });

    it("should render a button with default text", async () => {
      await setup();
      expect(screen.getByRole("button")).toHaveTextContent("Click me");
    });

    it("should render a button with custom text", async () => {
      await setup({
        settings: { "button.label": "Please Click Me" },
      });
      expect(screen.getByRole("button")).toHaveTextContent("Please Click Me");
    });

    it("clicking an action button should open a modal action form", async () => {
      await setup();

      userEvent.click(screen.getByRole("button"));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByTestId("action-form")).toBeInTheDocument();
      expect(screen.getByLabelText("Parameter 1")).toBeInTheDocument();
    });

    it("the modal should have the action name as a title", async () => {
      await setup();

      userEvent.click(screen.getByRole("button"));
      expect(screen.getByRole("dialog")).toHaveTextContent("My Awesome Action");
    });

    it("clicking the cancel button on the form should close the modal", async () => {
      await setup();

      userEvent.click(screen.getByRole("button"));
      expect(screen.getByRole("dialog")).toHaveTextContent("My Awesome Action");
      userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("should format dashboard filter values for numeric parameters", async () => {
      const parameterId = "parameter_1";
      const parameterTarget: ParameterTarget = [
        "variable",
        ["template-tag", "1"],
      ];

      const action = createMockQueryAction({
        database_id: DATABASE.id,
        parameters: [
          createMockActionParameter({
            id: parameterId,
            name: parameterId,
            type: "number/=",
            target: parameterTarget,
          }),
        ],
        visualization_settings: {
          fields: {
            [parameterId]: createMockFieldSettings({
              fieldType: "number",
              inputType: "number",
            }),
          },
        },
      });

      await setup({
        dashcard: createMockActionDashboardCard({
          action,
          parameter_mappings: [
            {
              parameter_id: "dash-param-1",
              target: parameterTarget,
            },
          ],
        }),
        parameterValues: { "dash-param-1": "44" },
      });

      userEvent.click(screen.getByRole("button", { name: "Click me" }));

      await waitFor(async () => {
        const call = fetchMock.lastCall(ACTION_EXEC_MOCK_PATH);
        expect(await call?.request?.json()).toEqual({
          modelId: ACTION_MODEL_ID,
          parameters: {
            parameter_1: 44,
          },
        });
      });
    });
  });

  describe("Form actions", () => {
    const formSettings = { actionDisplayType: "form" };

    it("should render an action form", async () => {
      await setup({ settings: formSettings });

      expect(screen.getByTestId("action-form")).toBeInTheDocument();
      expect(screen.getByLabelText("Parameter 1")).toBeInTheDocument();
    });

    it("should render the action name as the form title", async () => {
      await setup({ settings: formSettings });

      expect(
        screen.getByRole("heading", { name: "My Awesome Action" }),
      ).toBeInTheDocument();
    });

    it("should only show form fields with no provided values from dashboard filters", async () => {
      await setup({
        settings: formSettings,
        parameterValues: { "dash-param-1": "foo" },
      });

      expect(screen.queryByLabelText("Parameter 1")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Parameter 2")).toBeInTheDocument();
    });

    it("should render as a button if no parameters are missing", async () => {
      await setup({
        settings: formSettings,
        parameterValues: { "dash-param-1": "foo", "dash-param-2": 2 },
      });

      expect(
        screen.getByRole("button", { name: "Click me" }),
      ).toBeInTheDocument();
    });

    it("should submit provided form input values to the action execution endpoint", async () => {
      const expectedBody = {
        modelId: ACTION_MODEL_ID,
        parameters: {
          parameter_1: "foo",
          parameter_2: 5,
        },
      };

      await setup({ settings: formSettings });

      userEvent.type(screen.getByLabelText("Parameter 1"), "foo");
      await waitFor(() =>
        expect(screen.getByLabelText("Parameter 1")).toHaveValue("foo"),
      );

      userEvent.type(screen.getByLabelText("Parameter 2"), "5");
      await waitFor(() =>
        expect(screen.getByLabelText("Parameter 2")).toHaveValue(5),
      );

      userEvent.click(screen.getByRole("button", { name: ACTION.name }));

      await waitFor(async () => {
        const call = fetchMock.lastCall(ACTION_EXEC_MOCK_PATH);
        expect(await call?.request?.json()).toEqual(expectedBody);
      });
    });

    it("should combine data from dashboard parameters and form input when submitting for execution", async () => {
      const expectedBody = {
        modelId: ACTION_MODEL_ID,
        parameters: {
          parameter_1: "foo",
          parameter_2: 5,
        },
      };

      await setup({
        settings: formSettings,
        parameterValues: { "dash-param-2": "5" },
      });

      userEvent.type(screen.getByLabelText("Parameter 1"), "foo");
      await waitFor(() =>
        expect(screen.getByLabelText("Parameter 1")).toHaveValue("foo"),
      );

      userEvent.click(screen.getByRole("button", { name: ACTION.name }));

      await waitFor(async () => {
        const call = fetchMock.lastCall(ACTION_EXEC_MOCK_PATH);
        expect(await call?.request?.json()).toEqual(expectedBody);
      });
    });
  });

  describe("Implicit Actions", () => {
    it("shows a confirmation modal when clicking an implicit delete action with a provided parameter", async () => {
      await setup({
        dashcard: createMockActionDashboardCard({
          action: createMockImplicitQueryAction({
            name: "My Delete Action",
            kind: "row/delete",
            database_id: DATABASE.id,
            parameters: [
              createMockActionParameter({
                id: "1",
                name: "id",
                type: "type/Text",
                target: ["variable", ["template-tag", "1"]],
              }),
            ],
          }),
        }),
        parameterValues: { "dash-param-1": "foo" },
      });

      userEvent.click(screen.getByRole("button"));
      expect(screen.getByRole("dialog")).toHaveTextContent(/cannot be undone/i);
      expect(
        screen.getByRole("button", { name: "Delete" }),
      ).toBeInTheDocument();
    });
  });
});
