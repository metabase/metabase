import React from "react";
import _ from "underscore";
import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";

import {
  renderWithProviders,
  screen,
  getIcon,
  waitFor,
  waitForElementToBeRemoved,
} from "__support__/ui";
import { setupDatabasesEndpoints } from "__support__/server-mocks";

import {
  createMockActionDashboardCard,
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

const DATABASE_WITHOUT_ACTIONS = createMockDatabase({ id: 1 });
const DATABASE = createMockDatabase({
  id: 2,
  settings: { "database-enable-actions": true },
});

const defaultProps = {
  dashcard: {
    id: DASHCARD_ID,
    card_id: ACTION_MODEL_ID,
    action: createMockQueryAction({
      name: "My Awesome Action",
      database_id: DATABASE.id,
      parameters: [
        createMockActionParameter({
          id: "parameter_1",
          type: "type/Text",
          target: ["variable", ["template-tag", "1"]],
        }),
        createMockActionParameter({
          id: "parameter_2",
          type: "type/Integer",
          target: ["variable", ["template-tag", "2"]],
        }),
      ],
    }),
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
  },
  dashboard: createMockDashboard({ id: DASHBOARD_ID }),
  dispatch: _.noop,
  isSettings: false,
  isEditing: false,
  settings: {},
  onVisualizationClick: _.noop,
  parameterValues: {},
} as unknown as ActionProps;

type SetupOpts = Partial<ActionProps> & {
  awaitLoading?: boolean;
};

async function setup({ awaitLoading = true, ...props }: SetupOpts = {}) {
  setupDatabasesEndpoints([DATABASE, DATABASE_WITHOUT_ACTIONS]);

  renderWithProviders(<Action {...defaultProps} {...props} />);

  if (awaitLoading) {
    await waitForElementToBeRemoved(() =>
      screen.queryAllByTestId("loading-spinner"),
    );
  }
}

function setupExecutionEndpoint() {
  fetchMock.post(
    `path:/api/dashboard/${DASHBOARD_ID}/dashcard/${DASHCARD_ID}/execute`,
    {
      "rows-updated": [1],
    },
  );
}

describe("Actions > ActionViz > Action", () => {
  describe("Button actions", () => {
    it("should render an empty state for a button with no action", async () => {
      await setup({
        dashcard: {
          ...defaultProps.dashcard,
          action: undefined,
        },
        awaitLoading: false,
      });
      expect(getIcon("bolt")).toBeInTheDocument();
      expect(screen.getByRole("button")).toBeDisabled();
      expect(screen.getByLabelText(/no action assigned/i)).toBeInTheDocument();
    });

    it("should render a disabled state for a button with an action from a database where actions are disabled", async () => {
      await setup({
        dashcard: {
          ...defaultProps.dashcard,
          action: createMockQueryAction({
            name: "My Awesome Action",
            database_id: 1,
          }),
        },
      });
      expect(getIcon("bolt")).toBeInTheDocument();
      expect(screen.getByRole("button")).toBeDisabled();
      expect(
        screen.getByLabelText(/actions are not enabled/i),
      ).toBeInTheDocument();
    });

    it("should render an enabled state when the action is valid", async () => {
      await setup({
        dashcard: {
          ...defaultProps.dashcard,
          action: createMockQueryAction({
            name: "My Awesome Action",
            database_id: 2,
          }),
        },
      });
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
      const parameter = createMockActionParameter({
        id: "parameter_1",
        name: "parameter_1",
        type: "number/=",
        target: ["variable", ["template-tag", "1"]],
      });

      const action = createMockQueryAction({
        name: "My Awesome Action",
        database_id: 2,
        parameters: [parameter],
        visualization_settings: {
          fields: {
            [parameter.id]: createMockFieldSettings({
              fieldType: "number",
              inputType: "number",
            }),
          },
        },
      });

      setupExecutionEndpoint();
      await setup({
        dashcard: createMockActionDashboardCard({
          id: DASHCARD_ID,
          dashboard_id: DASHBOARD_ID,
          card_id: ACTION_MODEL_ID,
          action,
          card: defaultProps.dashcard.card,
          parameter_mappings: [
            {
              parameter_id: "dash-param-1",
              target: ["variable", ["template-tag", "1"]],
            },
          ],
        }),
        parameterValues: { "dash-param-1": "44" },
      });

      userEvent.click(screen.getByRole("button", { name: "Click me" }));

      await waitFor(async () => {
        const call = fetchMock.lastCall(
          `path:/api/dashboard/${DASHBOARD_ID}/dashcard/${DASHCARD_ID}/execute`,
        );
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

      expect(screen.getByText("My Awesome Action")).toBeInTheDocument();
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
        parameterValues: { "dash-param-1": "foo", "dash-param-2": "bar" },
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

      setupExecutionEndpoint();

      await setup({ settings: formSettings });

      userEvent.type(screen.getByLabelText("Parameter 1"), "foo");
      await waitFor(() =>
        expect(screen.getByLabelText("Parameter 1")).toHaveValue("foo"),
      );

      userEvent.type(screen.getByLabelText("Parameter 2"), "5");
      await waitFor(() =>
        expect(screen.getByLabelText("Parameter 2")).toHaveValue(5),
      );

      userEvent.click(screen.getByRole("button", { name: "Run" }));

      await waitFor(async () => {
        const call = fetchMock.lastCall(
          `path:/api/dashboard/${DASHBOARD_ID}/dashcard/${DASHCARD_ID}/execute`,
        );
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

      setupExecutionEndpoint();

      await setup({
        settings: formSettings,
        parameterValues: { "dash-param-2": "5" },
      });

      userEvent.type(screen.getByLabelText("Parameter 1"), "foo");
      await waitFor(() =>
        expect(screen.getByLabelText("Parameter 1")).toHaveValue("foo"),
      );

      userEvent.click(screen.getByRole("button", { name: "Run" }));

      await waitFor(async () => {
        const call = fetchMock.lastCall(
          `path:/api/dashboard/${DASHBOARD_ID}/dashcard/${DASHCARD_ID}/execute`,
        );
        expect(await call?.request?.json()).toEqual(expectedBody);
      });
    });
  });

  describe("Implicit Actions", () => {
    it("shows a confirmation modal when clicking an implicit delete action with a provided parameter", async () => {
      await setup({
        dashcard: {
          ...defaultProps.dashcard,
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
        },
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
