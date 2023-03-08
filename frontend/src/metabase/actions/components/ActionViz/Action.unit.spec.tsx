import React from "react";
import _ from "underscore";
import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";
import { waitFor } from "@testing-library/react";

import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockActionDashboardCard,
  createMockActionParameter,
  createMockFieldSettings,
  createMockQueryAction,
  createMockImplicitQueryAction,
  createMockDashboard,
  createMockDatabase,
} from "metabase-types/api/mocks";
import { createMockEntitiesState } from "metabase-types/store/mocks";

import Action, { ActionComponent, ActionProps } from "./Action";

const defaultProps = {
  dashcard: {
    id: 456,
    card_id: 777, // action model id
    action: createMockQueryAction({
      name: "My Awesome Action",
      database_id: 2,
      parameters: [
        createMockActionParameter({
          id: "parameter_1",
          type: "type/Text",
          target: ["variable", ["template-tag", "1"]],
        }),
        createMockActionParameter({
          id: "parameter_2",
          type: "type/Text",
          target: ["variable", ["template-tag", "2"]],
        }),
      ],
    }),
    parameter_mappings: [
      {
        parameter_id: "dash-param-1",
        card_id: 1,
        target: ["variable", ["template-tag", "1"]],
      },
      {
        parameter_id: "dash-param-2",
        card_id: 1,
        target: ["variable", ["template-tag", "2"]],
      },
    ],
  },
  dashboard: createMockDashboard({ id: 123 }),
  dispatch: _.noop,
  isSettings: false,
  isEditing: false,
  settings: {},
  onVisualizationClick: _.noop,
  parameterValues: {},
} as unknown as ActionProps;

const databases: Record<number, any> = {
  1: createMockDatabase({ id: 1 }),
  2: createMockDatabase({
    id: 2,
    settings: { "database-enable-actions": true },
  }),
};

async function setup(options?: Partial<ActionProps>) {
  return renderWithProviders(
    <ActionComponent {...defaultProps} {...options} />,
  );
}

async function setupActionWrapper(options?: Partial<ActionProps>) {
  const dbId = options?.dashcard?.action?.database_id ?? 0;

  fetchMock.get(`path:/api/database/${dbId}`, databases[dbId] ?? null);

  return renderWithProviders(<Action {...defaultProps} {...options} />, {
    withSampleDatabase: true,
    storeInitialState: {
      entities: createMockEntitiesState({
        databases,
      }),
    },
  });
}

function setupExecutionEndpoint() {
  fetchMock.post("path:/api/dashboard/123/dashcard/456/execute", {
    "rows-updated": [1],
  });
}

describe("Actions > ActionViz > ActionComponent", () => {
  // button actions are just a modal trigger around forms
  describe("Button actions", () => {
    it("should render an empty state for a button with no action", async () => {
      await setupActionWrapper({
        dashcard: {
          ...defaultProps.dashcard,
          action: undefined,
        },
      });
      expect(screen.getByLabelText("bolt icon")).toBeInTheDocument();
      expect(screen.getByRole("button")).toBeDisabled();
      expect(screen.getByLabelText(/no action assigned/i)).toBeInTheDocument();
    });

    it("should render a disabled state for a button with an action from a database where actions are disabled", async () => {
      await setupActionWrapper({
        dashcard: {
          ...defaultProps.dashcard,
          action: createMockQueryAction({
            name: "My Awesome Action",
            database_id: 1,
          }),
        },
      });
      expect(await screen.findByLabelText("bolt icon")).toBeInTheDocument();
      expect(await screen.findByRole("button")).toBeDisabled();
      expect(
        await screen.findByLabelText(/actions are not enabled/i),
      ).toBeInTheDocument();
    });

    it("should render an enabled state when the action is valid", async () => {
      await setupActionWrapper({
        dashcard: {
          ...defaultProps.dashcard,
          action: createMockQueryAction({
            name: "My Awesome Action",
            database_id: 2,
          }),
        },
      });
      expect(await screen.findByRole("button")).toBeEnabled();
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
          id: 456,
          dashboard_id: 123,
          card_id: 777, // action model id
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
          "path:/api/dashboard/123/dashcard/456/execute",
        );
        expect(await call?.request?.json()).toEqual({
          modelId: 777,
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
        await screen.findByRole("button", { name: "Click me" }),
      ).toBeInTheDocument();
    });

    it("should submit provided form input values to the action execution endpoint", async () => {
      const expectedBody = {
        modelId: 777,
        parameters: {
          parameter_1: "foo",
          parameter_2: "bar",
        },
      };

      setupExecutionEndpoint();

      await setup({ settings: formSettings });

      userEvent.type(screen.getByLabelText("Parameter 1"), "foo");
      await waitFor(() =>
        expect(screen.getByLabelText("Parameter 1")).toHaveValue("foo"),
      );

      userEvent.type(screen.getByLabelText("Parameter 2"), "bar");
      await waitFor(() =>
        expect(screen.getByLabelText("Parameter 2")).toHaveValue("bar"),
      );

      userEvent.click(screen.getByRole("button", { name: "Run" }));

      await waitFor(async () => {
        const call = fetchMock.lastCall(
          "path:/api/dashboard/123/dashcard/456/execute",
        );
        expect(await call?.request?.json()).toEqual(expectedBody);
      });
    });

    it("should combine data from dashboard parameters and form input when submitting for execution", async () => {
      const expectedBody = {
        modelId: 777,
        parameters: {
          parameter_1: "foo",
          parameter_2: "baz",
        },
      };

      setupExecutionEndpoint();

      await setup({
        settings: formSettings,
        parameterValues: { "dash-param-2": "baz" },
      });

      userEvent.type(screen.getByLabelText("Parameter 1"), "foo");
      await waitFor(() =>
        expect(screen.getByLabelText("Parameter 1")).toHaveValue("foo"),
      );

      userEvent.click(screen.getByRole("button", { name: "Run" }));

      await waitFor(async () => {
        const call = fetchMock.lastCall(
          "path:/api/dashboard/123/dashcard/456/execute",
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
