import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupActionEndpoints,
  setupCardsEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import {
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { getActionIsEnabledInDatabase } from "metabase/dashboard/utils";
import { checkNotNull } from "metabase/lib/types";
import type {
  ActionDashboardCard,
  ParameterTarget,
  Database,
} from "metabase-types/api";
import {
  createMockActionDashboardCard as _createMockActionDashboardCard,
  createMockActionParameter,
  createMockFieldSettings,
  createMockQueryAction,
  createMockImplicitQueryAction,
  createMockDashboard,
  createMockCard,
  createMockStructuredDatasetQuery,
  createMockDatabase,
} from "metabase-types/api/mocks";
import { createMockDashboardState } from "metabase-types/store/mocks";

import type { ActionProps } from "./Action";
import Action from "./Action";

const DASHBOARD_ID = 123;
const DASHCARD_ID = 456;
const ACTION_MODEL_ID = 777;
const ACTION_EXEC_MOCK_PATH = `path:/api/dashboard/${DASHBOARD_ID}/dashcard/${DASHCARD_ID}/execute`;

const DATABASE_ID = 1;

const ACTION = createMockQueryAction({
  name: "My Awesome Action",
  database_id: DATABASE_ID,
  model_id: ACTION_MODEL_ID,
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

const DATABASE = createMockDatabase({
  settings: {
    "database-enable-actions": true,
  },
});

const CARD = createMockCard({
  id: ACTION_MODEL_ID,
  database_id: DATABASE_ID,
  dataset_query: createMockStructuredDatasetQuery({
    database: DATABASE_ID,
  }),
  display: "action",
  can_write: true,
  type: "model",
});

function createMockActionDashboardCard(
  opts: Partial<ActionDashboardCard> = {},
) {
  return _createMockActionDashboardCard({
    id: DASHCARD_ID,
    card_id: CARD.id,
    card: CARD,
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

type SetupOpts = Partial<ActionProps>;

async function setup({
  database = DATABASE,
  dashboard = createMockDashboard({ id: DASHBOARD_ID }),
  dashcard = createMockActionDashboardCard(),
  settings = {},
  parameterValues = {},
  ...props
}: SetupOpts & {
  database?: Database;
} = {}) {
  const card = checkNotNull(dashcard.card);

  if (getActionIsEnabledInDatabase(dashcard)) {
    fetchMock.get(ACTION_EXEC_MOCK_PATH, {});
    fetchMock.post(ACTION_EXEC_MOCK_PATH, { "rows-updated": [1] });

    // for ActionCreator modal (action edit modal)
    setupDatabasesEndpoints([database]);
    setupCardsEndpoints([card]);
    setupActionEndpoints(ACTION);
  }

  renderWithProviders(
    <Action
      dashboard={dashboard}
      dashcard={dashcard}
      settings={settings}
      parameterValues={parameterValues}
      isSettings={false}
      isEditingDashcard={false}
      dispatch={jest.fn()}
      {...props}
    />,
    {
      storeInitialState: {
        entities: createMockEntitiesState({
          databases: [database],
        }),
        dashboard: createMockDashboardState({
          parameterValues,
        }),
      },
    },
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
            database_enabled_actions: false,
          }),
        }),
      });
      expect(getIcon("bolt")).toBeInTheDocument();
      expect(screen.getByRole("button")).toBeDisabled();
      expect(
        screen.getByLabelText(/actions are not enabled/i),
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

    it("clicking an action button with parameters should open a modal action form", async () => {
      await setup();

      await userEvent.click(screen.getByRole("button"));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByTestId("action-form")).toBeInTheDocument();
      expect(screen.getByLabelText("Parameter 1")).toBeInTheDocument();
    });

    it("clicking an action button without parameters should open a confirmation modal", async () => {
      await setup({
        dashcard: createMockActionDashboardCard({
          action: createMockQueryAction({
            database_id: DATABASE_ID,
            model_id: ACTION_MODEL_ID,
          }),
          parameter_mappings: [],
        }),
      });

      await userEvent.click(screen.getByRole("button"));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByTestId("action-form")).toBeInTheDocument();
      expect(screen.queryByLabelText(/^Parameter/)).not.toBeInTheDocument();
    });

    it("the modal should have the action name as a title", async () => {
      await setup();

      await userEvent.click(screen.getByRole("button"));
      expect(screen.getByRole("dialog")).toHaveTextContent("My Awesome Action");
    });

    it("clicking the cancel button on the form should close the modal", async () => {
      await setup();

      await userEvent.click(screen.getByRole("button"));
      expect(screen.getByRole("dialog")).toHaveTextContent("My Awesome Action");
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("should format dashboard filter values for numeric parameters", async () => {
      const parameterId = "parameter_1";
      const parameterTarget: ParameterTarget = [
        "variable",
        ["template-tag", "1"],
      ];

      const action = {
        ...ACTION,
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
      };

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

      await userEvent.click(screen.getByRole("button", { name: "Click me" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByTestId("action-form")).toBeInTheDocument();
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: action.name,
        }),
      );

      await waitFor(async () => {
        expect(fetchMock.called(ACTION_EXEC_MOCK_PATH)).toBe(true);
      });

      const call = fetchMock.lastCall(ACTION_EXEC_MOCK_PATH);
      expect(await call?.request?.json()).toEqual({
        modelId: ACTION_MODEL_ID,
        parameters: {
          parameter_1: 44,
        },
      });
    });

    it("should NOT allow to edit underlying action if a user does not has edit permissions for this model", async () => {
      await setup({
        dashcard: createMockActionDashboardCard({
          card: {
            ...CARD,
            can_write: false,
          },
        }),
      });

      await userEvent.click(screen.getByText("Click me"));

      expect(queryIcon("pencil")).not.toBeInTheDocument();
    });

    it("should NOT allow to edit underlying action if a user does not has edit permissions for this database", async () => {
      const readOnlyDB: Database = {
        ...DATABASE,
        native_permissions: "none",
      };

      await setup({ database: readOnlyDB });

      await userEvent.click(screen.getByText("Click me"));

      expect(queryIcon("pencil")).not.toBeInTheDocument();
    });

    it("should allow to edit underlying action if a user has edit permissions", async () => {
      await setup();

      await userEvent.click(screen.getByText("Click me"));

      const editActionEl = getIcon("pencil");
      expect(editActionEl).toBeInTheDocument();

      await userEvent.click(editActionEl);

      const editorModal = await screen.findByTestId("action-editor-modal");

      await within(editorModal).findByText("My Awesome Action");

      const cancelEditButton = within(editorModal).getByText("Cancel");
      expect(cancelEditButton).toBeInTheDocument();

      expect(within(editorModal).getByText("Update")).toBeInTheDocument();

      await userEvent.click(cancelEditButton);

      expect(
        screen.getByTestId("action-parameters-input-modal"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("action-form")).toBeInTheDocument();
      expect(screen.getByLabelText("Parameter 1")).toBeInTheDocument();
    });

    it("should open action form after action editing", async () => {
      const updatedTitle = "Test action title";
      await setup();

      fetchMock.putOnce(
        `path:/api/action/${ACTION.id}`,
        {
          ...ACTION,
          name: updatedTitle,
        },
        {
          overwriteRoutes: true,
        },
      );

      await userEvent.click(screen.getByText("Click me"));

      await userEvent.click(getIcon("pencil"));

      // wait for action edit form to be loaded
      const editorModal = await screen.findByTestId("action-editor-modal");

      // edit action title
      const actionTitleField = await within(editorModal).findByTestId(
        "editable-text",
      );
      await userEvent.type(actionTitleField, updatedTitle);
      await userEvent.tab(); // blur field

      await userEvent.click(within(editorModal).getByText("Update"));

      expect(fetchMock.called(`path:/api/action/${ACTION.id}`)).toBe(true);

      await waitFor(() => {
        expect(screen.queryByTestId("action-creator")).not.toBeInTheDocument();
      });

      expect(
        screen.getByTestId("action-parameters-input-modal"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("action-form")).toBeInTheDocument();
      expect(screen.getByLabelText("Parameter 1")).toBeInTheDocument();
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

      await userEvent.type(screen.getByLabelText("Parameter 1"), "foo");
      await waitFor(() =>
        expect(screen.getByLabelText("Parameter 1")).toHaveValue("foo"),
      );

      await userEvent.type(screen.getByLabelText("Parameter 2"), "5");
      await waitFor(() =>
        expect(screen.getByLabelText("Parameter 2")).toHaveValue(5),
      );

      await userEvent.click(screen.getByRole("button", { name: ACTION.name }));

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

      await userEvent.type(screen.getByLabelText("Parameter 1"), "foo");
      await waitFor(() =>
        expect(screen.getByLabelText("Parameter 1")).toHaveValue("foo"),
      );

      await userEvent.click(screen.getByRole("button", { name: ACTION.name }));

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
            model_id: ACTION_MODEL_ID,
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

      await userEvent.click(screen.getByRole("button"));
      expect(screen.getByRole("dialog")).toHaveTextContent(/cannot be undone/i);
      expect(
        screen.getByRole("button", { name: "Delete" }),
      ).toBeInTheDocument();
    });
  });
});
