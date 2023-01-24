import React from "react";
import _ from "underscore";
import nock from "nock";
import userEvent from "@testing-library/user-event";
import { waitFor } from "@testing-library/react";

import { render, screen } from "__support__/ui";

import {
  createMockActionParameter,
  createMockQueryAction,
  createMockImplicitQueryAction,
  createMockDashboard,
} from "metabase-types/api/mocks";

import Action, { ActionComponent, ActionProps } from "./Action";

const defaultProps = {
  dashcard: {
    id: 456,
    card_id: 777, // action model id
    action: createMockQueryAction({
      name: "My Awesome Action",
      parameters: [
        createMockActionParameter({
          id: "1",
          name: "Parameter 1",
          type: "type/Text",
          target: ["variable", ["template-tag", "1"]],
        }),
        createMockActionParameter({
          id: "2",
          name: "Parameter 2",
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

async function setup(options?: Partial<ActionProps>) {
  return render(<ActionComponent {...defaultProps} {...options} />);
}

async function setupActionWrapper(options?: Partial<ActionProps>) {
  return render(<Action {...defaultProps} {...options} />);
}

function setupExecutionEndpoint(expectedBody: any) {
  const scope = nock(location.origin)
    .post("/api/dashboard/123/dashcard/456/execute", expectedBody)
    .reply(200, { "rows-updated": [1] });

  return scope;
}

describe("Actions > ActionViz > ActionComponent", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  // button actions are just a modal trigger around forms
  describe("Button actions", () => {
    it("should render an empty state for a button with no action", async () => {
      await setupActionWrapper({
        dashcard: {
          ...defaultProps.dashcard,
          action: undefined,
        },
      });
      expect(screen.getByText("Assign an action")).toBeInTheDocument();
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
          "1": "foo",
          "2": "bar",
        },
      };

      const scope = setupExecutionEndpoint(expectedBody);

      await setup({ settings: formSettings });

      userEvent.type(screen.getByLabelText("Parameter 1"), "foo");
      await waitFor(() =>
        expect(screen.getByLabelText("Parameter 1")).toHaveValue("foo"),
      );

      userEvent.type(screen.getByLabelText("Parameter 2"), "bar");
      await waitFor(() =>
        expect(screen.getByLabelText("Parameter 2")).toHaveValue("bar"),
      );

      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(scope.isDone()).toBe(true));
    });

    it("should combine data from dashboard parameters and form input when submitting for execution", async () => {
      const expectedBody = {
        modelId: 777,
        parameters: {
          "1": "foo",
          "2": "baz",
        },
      };

      const scope = setupExecutionEndpoint(expectedBody);

      await setup({
        settings: formSettings,
        parameterValues: { "dash-param-2": "baz" },
      });

      userEvent.type(screen.getByLabelText("Parameter 1"), "foo");
      await waitFor(() =>
        expect(screen.getByLabelText("Parameter 1")).toHaveValue("foo"),
      );

      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(scope.isDone()).toBe(true));
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

  describe("Link buttons", () => {
    it("renders a link button", async () => {
      const clickBehavior = {
        type: "link",
        linkType: "url",
        linkTemplate: "https://metabase.com",
      };

      await setup({
        dashcard: {
          ...defaultProps.dashcard,
          action: undefined,
        },
        settings: {
          "button.label": "Link Button",
          click_behavior: clickBehavior,
        },
      } as unknown as Partial<ActionProps>);

      expect(screen.getByRole("button")).toHaveTextContent("Link Button");
    });

    it("triggers onVisualizationClick when clicking a link button", async () => {
      const clickSpy = jest.fn();
      const clickBehavior = {
        type: "link",
        linkType: "url",
        linkTemplate: "https://metabase.com",
      };
      await setup({
        dashcard: { action: undefined },
        settings: {
          "button.label": "Link Button",
          click_behavior: clickBehavior,
        },
        onVisualizationClick: clickSpy,
      } as unknown as Partial<ActionProps>);

      userEvent.click(screen.getByText("Link Button"));
      await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    });
  });
});
