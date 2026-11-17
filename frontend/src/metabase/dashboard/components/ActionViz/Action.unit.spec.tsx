import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { type ComponentProps, useState } from "react";

import {
  setupActionEndpoints,
  setupCardsEndpoints,
  setupDatabasesEndpoints,
  setupPrefetchDashcardValuesEndpoint,
} from "__support__/server-mocks";
import {
  createMockDashboardState,
  createMockStoreDashboard,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  act,
  fireEvent,
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { SET_PARAMETER_VALUE } from "metabase/dashboard/actions";
import { getActionIsEnabledInDatabase } from "metabase/dashboard/utils";
import { useSelector } from "metabase/redux";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  ActionDashboardCard,
  DashboardCard,
  Database,
  ParameterTarget,
  WritebackAction,
} from "metabase-types/api";
import {
  createMockActionDashboardCard as _createMockActionDashboardCard,
  createMockActionParameter,
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDatabase,
  createMockFieldSettings,
  createMockImplicitQueryAction,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import type { ActionProps } from "./Action";
import { Action } from "./Action";

const DASHBOARD_ID = 123;
const DASHCARD_ID = 456;
const ACTION_MODEL_ID = 777;
const ACTION_EXEC_MOCK_PATH = `path:/api/dashboard/${DASHBOARD_ID}/dashcard/${DASHCARD_ID}/execute`;

const DATABASE_ID = 1;

const ACTION = createMockQueryAction({
  name: "My Awesome Action",
  database_id: DATABASE_ID,
  dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
    query: "SELECT 1",
  }),
  model_id: ACTION_MODEL_ID,
  can_write: true,
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
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
  ),
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
    setupPrefetchDashcardValuesEndpoint(DASHBOARD_ID, DASHCARD_ID, {});
    fetchMock.post(ACTION_EXEC_MOCK_PATH, { "rows-updated": 1 });

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

    it("should render a disabled state for a button with an archived action", async () => {
      await setup({
        dashcard: createMockActionDashboardCard({
          action: { ...ACTION, archived: true },
        }),
      });
      expect(screen.getByRole("button")).toBeDisabled();
      expect(
        screen.getByLabelText(/this action is archived/i),
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
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
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
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(screen.getByTestId("action-form")).toBeInTheDocument();
      expect(screen.queryByLabelText(/^Parameter/)).not.toBeInTheDocument();
    });

    it("the modal should have the action name as a title", async () => {
      await setup();

      await userEvent.click(screen.getByRole("button"));
      expect(await screen.findByRole("dialog")).toHaveTextContent(
        "My Awesome Action",
      );
    });

    it("clicking the cancel button on the form should close the modal", async () => {
      await setup();

      await userEvent.click(screen.getByRole("button"));
      expect(await screen.findByRole("dialog")).toHaveTextContent(
        "My Awesome Action",
      );
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
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
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(screen.getByTestId("action-form")).toBeInTheDocument();
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: action.name,
        }),
      );

      await waitFor(async () => {
        expect(fetchMock.callHistory.called(ACTION_EXEC_MOCK_PATH)).toBe(true);
      });

      const call = fetchMock.callHistory.lastCall(ACTION_EXEC_MOCK_PATH);
      expect(await call?.request?.json()).toEqual({
        modelId: ACTION_MODEL_ID,
        parameters: {
          parameter_1: 44,
        },
      });
    });

    it("should NOT allow to edit underlying action if a user can't write it", async () => {
      await setup({
        dashcard: createMockActionDashboardCard({
          action: { ...ACTION, can_write: false },
        }),
      });

      await userEvent.click(screen.getByText("Click me"));

      expect(queryIcon("pencil")).not.toBeInTheDocument();
    });

    it("should allow to edit underlying action if a user has edit permissions", async () => {
      await setup();

      await userEvent.click(screen.getByText("Click me"));

      const editActionEl = await screen.findByRole("button", {
        name: "Edit this action",
      });
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

      fetchMock.modifyRoute(`action-${ACTION.id}-put`, {
        response: {
          ...ACTION,
          name: updatedTitle,
        },
      });

      await userEvent.click(screen.getByText("Click me"));

      await userEvent.click(
        await screen.findByRole("button", { name: "Edit this action" }),
      );

      // wait for action edit form to be loaded
      const editorModal = await screen.findByTestId("action-editor-modal");

      // edit action title
      const actionTitleField =
        await within(editorModal).findByTestId("editable-text");
      await userEvent.type(actionTitleField, updatedTitle);
      await userEvent.tab(); // blur field

      await userEvent.click(within(editorModal).getByText("Update"));

      expect(
        fetchMock.callHistory.called(`path:/api/action/${ACTION.id}`),
      ).toBe(true);

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
        expect(screen.getByLabelText("Parameter 2")).toHaveValue("5"),
      );

      await userEvent.click(screen.getByRole("button", { name: ACTION.name }));

      await waitFor(async () => {
        const call = fetchMock.callHistory.lastCall(ACTION_EXEC_MOCK_PATH);
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
        const call = fetchMock.callHistory.lastCall(ACTION_EXEC_MOCK_PATH);
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
      expect(await screen.findByRole("dialog")).toHaveTextContent(
        /cannot be undone/i,
      );
      expect(
        screen.getByRole("button", { name: "Delete" }),
      ).toBeInTheDocument();
    });
  });
});

const EDITABLE_ACTION = createMockQueryAction({
  ...ACTION,
  visualization_settings: {
    fields: {
      parameter_1: createMockFieldSettings({
        id: "parameter_1",
        fieldType: "string",
        inputType: "string",
      }),
      parameter_2: createMockFieldSettings({
        id: "parameter_2",
        fieldType: "number",
        inputType: "number",
      }),
    },
  },
});

const QUESTION_DASHCARD_ID = 789;
const QUESTION_CARD = createMockCard({ id: 999, name: "Scores" });

type StoreSetupOpts = {
  action?: WritebackAction;
  parameterMappings?: ActionDashboardCard["parameter_mappings"];
  parameterValues?: Record<string, string>;
  prefetchValues?: (parameters: unknown) => Record<string, unknown>;
  withQuestionDashcard?: boolean;
  executeResponse?: object;
  prefetchDelayMs?: number;
};

/**
 * Renders the action from the dashboard state, like the dashboard does, so
 * edits made to the action in the execute modal reach the button through the
 * store.
 */
function StoreAction(
  props: Omit<ComponentProps<typeof Action>, "dashcard" | "dashboard">,
) {
  // The store only holds the action dashcard this test put there
  const dashcard = useSelector(
    (state) => state.dashboard.dashcards[DASHCARD_ID],
  ) as ActionDashboardCard;
  const [dashboard] = useState(() => createMockDashboard({ id: DASHBOARD_ID }));
  return <Action {...props} dashcard={dashcard} dashboard={dashboard} />;
}

function setupWithStore({
  action = ACTION,
  parameterMappings = [],
  parameterValues = {},
  prefetchValues,
  withQuestionDashcard = false,
  executeResponse = { "rows-updated": [1] },
  prefetchDelayMs = 0,
}: StoreSetupOpts = {}) {
  const dashcard = createMockActionDashboardCard({
    action,
    parameter_mappings: parameterMappings,
  });
  const questionDashcard = createMockDashboardCard({
    id: QUESTION_DASHCARD_ID,
    dashboard_id: DASHBOARD_ID,
    card_id: QUESTION_CARD.id,
    card: QUESTION_CARD,
  });
  const dashcards: DashboardCard[] = withQuestionDashcard
    ? [dashcard, questionDashcard]
    : [dashcard];

  fetchMock.post(
    `path:/api/dashboard/${DASHBOARD_ID}/dashcard/${DASHCARD_ID}/execute/values`,
    async (call) => {
      return prefetchValues?.(getRequestParameters(call.options.body)) ?? {};
    },
    { name: "prefetch", delay: prefetchDelayMs },
  );
  fetchMock.post(ACTION_EXEC_MOCK_PATH, executeResponse);
  fetchMock.post(
    `path:/api/dashboard/${DASHBOARD_ID}/dashcard/${QUESTION_DASHCARD_ID}/card/${QUESTION_CARD.id}/query`,
    {},
    { name: "question-dashcard-query" },
  );
  setupDatabasesEndpoints([DATABASE]);
  setupCardsEndpoints([CARD]);
  setupActionEndpoints(action);
  // Echo the edited action back, like the API does
  fetchMock.modifyRoute(`action-${action.id}-put`, {
    response: (call: { options: RequestInit }) => {
      const edits: unknown = JSON.parse(String(call.options.body));
      return typeof edits === "object" ? { ...action, ...edits } : action;
    },
  });

  return renderWithProviders(
    <StoreAction
      settings={{}}
      parameterValues={parameterValues}
      isSettings={false}
      isEditingDashcard={false}
      dispatch={jest.fn()}
    />,
    {
      withUndos: true,
      storeInitialState: {
        entities: createMockEntitiesState({ databases: [DATABASE] }),
        dashboard: createMockDashboardState({
          dashboardId: DASHBOARD_ID,
          dashboards: {
            [DASHBOARD_ID]: createMockStoreDashboard({
              id: DASHBOARD_ID,
              dashcards: dashcards.map(({ id }) => id),
            }),
          },
          dashcards: Object.fromEntries(dashcards.map((dc) => [dc.id, dc])),
          parameterValues,
        }),
      },
    },
  );
}

async function openActionEditor() {
  const modal = await screen.findByTestId("action-parameters-input-modal");
  await userEvent.click(
    within(modal).getByRole("button", { name: "Edit this action" }),
  );
  return screen.findByTestId("action-editor-modal");
}

async function submitActionEditor(editorModal: HTMLElement) {
  await userEvent.click(
    within(editorModal).getByRole("button", { name: "Update" }),
  );
  await waitFor(() => {
    expect(screen.queryByTestId("action-creator")).not.toBeInTheDocument();
  });
}

async function findFormFieldEditor(editorModal: HTMLElement, label: string) {
  await within(editorModal).findByLabelText(label);
  return checkNotNull(
    within(editorModal)
      .getAllByTestId("form-field-container")
      .find((container) => within(container).queryByLabelText(label)),
  );
}

function getRequestParameters(requestBody: RequestInit["body"]): unknown {
  const body: unknown = JSON.parse(String(requestBody));
  return typeof body === "object" && body !== null && "parameters" in body
    ? body.parameters
    : undefined;
}

function getLastExecuteParameters() {
  const call = fetchMock.callHistory.lastCall(ACTION_EXEC_MOCK_PATH);
  return getRequestParameters(call?.options.body);
}

describe("Actions > ActionViz > Action (dashboard state)", () => {
  it("shows the new action title and field placeholder in the execute modal after editing the action", async () => {
    setupWithStore({ action: EDITABLE_ACTION });

    await userEvent.click(await screen.findByText("Click me"));
    const editorModal = await openActionEditor();

    const titleField =
      await within(editorModal).findByDisplayValue("My Awesome Action");
    await userEvent.clear(titleField);
    await userEvent.type(titleField, "New action name");
    await userEvent.tab();

    await userEvent.click(
      within(
        await findFormFieldEditor(editorModal, "Parameter 1"),
      ).getByLabelText("Field settings"),
    );
    await userEvent.type(
      await screen.findByLabelText("Placeholder text"),
      "Test placeholder",
    );

    await submitActionEditor(editorModal);

    const modal = screen.getByTestId("action-parameters-input-modal");
    expect(
      within(modal).getByRole("heading", { name: "New action name" }),
    ).toBeInTheDocument();
    expect(
      within(modal).getByPlaceholderText("Test placeholder"),
    ).toBeInTheDocument();
  });

  it("runs the action with the query parameters and field types edited in the execute modal", async () => {
    const { store } = setupWithStore({ action: EDITABLE_ACTION });

    await userEvent.click(await screen.findByText("Click me"));
    let editorModal = await openActionEditor();

    const titleField =
      await within(editorModal).findByDisplayValue("My Awesome Action");
    await userEvent.clear(titleField);
    await userEvent.type(titleField, "New action name");
    await userEvent.tab();
    await submitActionEditor(editorModal);

    editorModal = await openActionEditor();
    fireEvent.change(
      within(
        await within(editorModal).findByTestId("mock-native-query-editor"),
      ).getByRole("textbox"),
      {
        target: {
          value:
            "UPDATE many_data_types SET timestamp = {{ Timestamp }} WHERE id = {{ ID }}",
        },
      },
    );

    await userEvent.click(
      within(await findFormFieldEditor(editorModal, "ID")).getByRole("radio", {
        name: "Number",
      }),
    );
    await userEvent.click(
      within(await findFormFieldEditor(editorModal, "Timestamp")).getByRole(
        "radio",
        {
          name: "Date",
        },
      ),
    );
    await submitActionEditor(editorModal);

    const putBody: unknown = JSON.parse(
      String(
        fetchMock.callHistory.lastCall(`action-${ACTION.id}-put`)?.options.body,
      ),
    );
    expect(putBody).toMatchObject({
      dataset_query: {
        stages: [
          {
            native:
              "UPDATE many_data_types SET timestamp = {{ Timestamp }} WHERE id = {{ ID }}",
            "template-tags": expect.arrayContaining([
              expect.objectContaining({ name: "ID", type: "number" }),
              expect.objectContaining({ name: "Timestamp", type: "date" }),
            ]),
          },
        ],
      },
    });

    const storedDashcard = store.getState().dashboard.dashcards[DASHCARD_ID];
    const editedAction = checkNotNull(
      "action" in storedDashcard ? storedDashcard.action : undefined,
    );
    const parameterId = (name: string) =>
      checkNotNull(
        editedAction.parameters?.find((parameter) => parameter.name === name),
      ).id;

    const modal = screen.getByTestId("action-parameters-input-modal");
    expect(await within(modal).findByLabelText("Timestamp")).toHaveAttribute(
      "type",
      "date",
    );
    expect(within(modal).getByLabelText("ID")).toHaveAttribute(
      "inputmode",
      "decimal",
    );
    expect(
      within(modal).queryByLabelText("Parameter 1"),
    ).not.toBeInTheDocument();

    fireEvent.change(within(modal).getByLabelText("Timestamp"), {
      target: { value: "2020-02-02" },
    });
    await userEvent.type(within(modal).getByLabelText("ID"), "1");
    await userEvent.click(
      within(modal).getByRole("button", { name: "New action name" }),
    );

    expect(
      await screen.findByText("New action name ran successfully"),
    ).toBeInTheDocument();
    expect(getLastExecuteParameters()).toEqual({
      [parameterId("ID")]: 1,
      [parameterId("Timestamp")]: "2020-02-02",
    });
  });

  it("closes the modal, shows a toast and reloads the dashboard cards after running a query action mapped to a dashboard filter (metabase#32974)", async () => {
    const idParameter = createMockActionParameter({
      id: "id-parameter",
      name: "ID",
      slug: "id",
      type: "number/=",
      target: ["variable", ["template-tag", "id"]],
    });
    const action = createMockQueryAction({
      ...ACTION,
      name: "Query action",
      parameters: [idParameter],
      visualization_settings: {
        fields: {
          [idParameter.id]: createMockFieldSettings({
            id: idParameter.id,
            fieldType: "number",
            inputType: "number",
            required: true,
          }),
        },
      },
    });

    setupWithStore({
      action,
      parameterMappings: [
        { parameter_id: "dash-id", target: idParameter.target },
      ],
      parameterValues: { "dash-id": "1" },
      withQuestionDashcard: true,
    });

    await userEvent.click(await screen.findByText("Click me"));
    const modal = await screen.findByTestId("action-parameters-input-modal");
    await userEvent.click(
      within(modal).getByRole("button", { name: "Query action" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByTestId("action-parameters-input-modal"),
      ).not.toBeInTheDocument();
    });
    expect(
      await screen.findByText("Query action ran successfully"),
    ).toBeInTheDocument();
    expect(getLastExecuteParameters()).toEqual({ [idParameter.id]: 1 });
    await waitFor(() => {
      expect(fetchMock.callHistory.called("question-dashcard-query")).toBe(
        true,
      );
    });
  });

  describe("implicit update actions", () => {
    /** Answers the prefetch request with the row whose primary key was requested. */
    function prefetchRow(
      primaryKeyName: string,
      names: Record<string, string>,
    ) {
      return (parameters: unknown) => {
        const key =
          typeof parameters === "object" &&
          parameters !== null &&
          primaryKeyName in parameters
            ? String(Reflect.get(parameters, primaryKeyName))
            : "";
        return key in names
          ? { [primaryKeyName]: Number(key), name: names[key] }
          : {};
      };
    }

    function getLastPrefetchParameters() {
      return getRequestParameters(
        fetchMock.callHistory.lastCall("prefetch")?.options.body,
      );
    }

    function createUpdateAction(primaryKeyName: string) {
      const primaryKey = createMockActionParameter({
        id: primaryKeyName,
        name: primaryKeyName,
        slug: primaryKeyName,
        type: "number/=",
        target: ["variable", ["template-tag", primaryKeyName]],
      });
      const name = createMockActionParameter({
        id: "name",
        name: "Name",
        slug: "name",
        type: "string/=",
        target: ["variable", ["template-tag", "name"]],
      });
      const action = createMockImplicitQueryAction({
        id: 42,
        name: "Update",
        kind: "row/update",
        model_id: ACTION_MODEL_ID,
        database_id: DATABASE_ID,
        parameters: [primaryKey, name],
      });
      return { action, primaryKey };
    }

    it.each(["id", "foo"])(
      "passes the primary key called '%s' from a dashboard filter to the execute endpoint (metabase#51020)",
      async (primaryKeyName) => {
        const { action, primaryKey } = createUpdateAction(primaryKeyName);
        setupWithStore({
          action,
          parameterMappings: [
            { parameter_id: "dash-pk", target: primaryKey.target },
          ],
          parameterValues: { "dash-pk": "2" },
          prefetchValues: prefetchRow(primaryKeyName, {
            "1": "Foo",
            "2": "Bar",
          }),
        });

        await userEvent.click(await screen.findByText("Click me"));
        const modal = await screen.findByTestId(
          "action-parameters-input-modal",
        );
        const nameInput = await within(modal).findByLabelText("Name");
        await waitFor(() => expect(nameInput).toHaveValue("Bar"));
        expect(getLastPrefetchParameters()).toEqual({ [primaryKeyName]: "2" });
        await userEvent.type(nameInput, " Baz");
        await userEvent.click(
          within(modal).getByRole("button", { name: "Update" }),
        );

        expect(
          await screen.findByText("Successfully updated"),
        ).toBeInTheDocument();
        expect(getLastExecuteParameters()).toEqual({
          [primaryKeyName]: 2,
          name: "Bar Baz",
        });
      },
    );

    it("refetches the form values when the dashboard filter changes the row id (metabase#33084)", async () => {
      const { action, primaryKey } = createUpdateAction("id");
      const { store } = setupWithStore({
        action,
        parameterMappings: [
          { parameter_id: "dash-pk", target: primaryKey.target },
        ],
        parameterValues: { "dash-pk": "5" },
        prefetchValues: prefetchRow("id", {
          "5": "Energetic Elephants",
          "10": "Jolly Jellyfish",
        }),
      });

      await userEvent.click(await screen.findByText("Click me"));
      let modal = await screen.findByTestId("action-parameters-input-modal");
      await waitFor(() =>
        expect(within(modal).getByLabelText("Name")).toHaveValue(
          "Energetic Elephants",
        ),
      );
      await userEvent.click(
        within(modal).getByRole("button", { name: "Cancel" }),
      );
      await waitFor(() =>
        expect(
          screen.queryByTestId("action-parameters-input-modal"),
        ).not.toBeInTheDocument(),
      );

      act(() => {
        store.dispatch({
          type: SET_PARAMETER_VALUE,
          payload: { id: "dash-pk", value: "10", isDraft: false },
        });
      });

      await userEvent.click(screen.getByText("Click me"));
      modal = await screen.findByTestId("action-parameters-input-modal");
      await waitFor(() =>
        expect(within(modal).getByLabelText("Name")).toHaveValue(
          "Jolly Jellyfish",
        ),
      );
    });

    it("shows the constraint violation errors returned by the execute endpoint", async () => {
      const { action, primaryKey } = createUpdateAction("id");
      setupWithStore({
        action,
        parameterMappings: [
          { parameter_id: "dash-pk", target: primaryKey.target },
        ],
        parameterValues: { "dash-pk": "10" },
        prefetchValues: prefetchRow("id", {
          "5": "Energetic Elephants",
          "10": "Jolly Jellyfish",
        }),
        // The form fields only appear once the row values arrive
        prefetchDelayMs: 200,
        executeResponse: {
          status: 400,
          body: {
            message: "Name already exists.",
            errors: { name: "This Name value already exists." },
          },
        },
      });
      await userEvent.click(await screen.findByText("Click me"));
      const modal = await screen.findByTestId("action-parameters-input-modal");
      const nameInput = await within(modal).findByLabelText("Name");
      await waitFor(() => expect(nameInput).toHaveValue("Jolly Jellyfish"));
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, "Kind Koalas");
      await userEvent.click(
        within(modal).getByRole("button", { name: "Update" }),
      );

      expect(
        await within(modal).findByText("This Name value already exists."),
      ).toBeInTheDocument();
      expect(
        within(modal).getByText("Name already exists."),
      ).toBeInTheDocument();
      expect(within(modal).getByLabelText("Name")).toBeInTheDocument();
    });
  });
});
