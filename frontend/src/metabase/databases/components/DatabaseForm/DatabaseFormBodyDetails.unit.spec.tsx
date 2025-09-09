import { Formik } from "formik";

import { render, screen } from "__support__/ui";
import type { Engine, EngineField } from "metabase-types/api";
import {
  createMockEngine,
  createMockEngineField,
} from "metabase-types/api/mocks";

import { DatabaseFormBodyDetails } from "./DatabaseFormBodyDetails";

const mockFields: EngineField[] = [
  createMockEngineField({
    name: "host",
    "display-name": "Host",
    type: "string",
    required: true,
  }),
  createMockEngineField({
    name: "port",
    "display-name": "Port",
    type: "integer",
    default: 5432,
  }),
  createMockEngineField({
    name: "user",
    "display-name": "Username",
    type: "string",
  }),
  createMockEngineField({
    name: "password",
    "display-name": "Password",
    type: "password",
  }),
];

const mockEngine: Engine = createMockEngine({
  "driver-name": "PostgreSQL",
  "details-fields": mockFields,
});

const defaultProps = {
  fields: mockFields,
  engineKey: "postgres" as const,
  engine: mockEngine,
};

function setup({
  fields = mockFields,
  initialValues = {},
  autofocusFieldName = "",
} = {}) {
  return render(
    <Formik
      initialValues={{
        host: "",
        port: "",
        user: "",
        password: "",
        ...initialValues,
      }}
      onSubmit={() => {}}
    >
      <DatabaseFormBodyDetails
        {...defaultProps}
        fields={fields}
        autofocusFieldName={autofocusFieldName}
      />
    </Formik>,
  );
}

describe("DatabaseFormBodyDetails", () => {
  it("renders all fields when no grouping is applied", () => {
    const fieldsWithoutGrouping = [
      createMockEngineField({ name: "user", "display-name": "Username" }),
      createMockEngineField({ name: "password", "display-name": "Password" }),
    ];

    setup({
      fields: fieldsWithoutGrouping,
    });

    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("groups host and port fields together", () => {
    setup();

    const hostField = screen.getByLabelText("Host");
    const portField = screen.getByLabelText("Port");

    expect(hostField).toBeInTheDocument();
    expect(portField).toBeInTheDocument();

    const groupContainer = screen.getByTestId("host-and-port");
    expect(groupContainer).toContainElement(hostField);
    expect(groupContainer).toContainElement(portField);
  });

  it("renders non-grouped fields outside of group containers", () => {
    setup();

    const userField = screen.getByLabelText("Username");
    const passwordField = screen.getByLabelText("Password");

    expect(userField).toBeInTheDocument();
    expect(passwordField).toBeInTheDocument();

    const groupContainer = screen.getByTestId("host-and-port");
    expect(groupContainer).toBeInTheDocument();

    expect(groupContainer).not.toContainElement(userField);
    expect(groupContainer).not.toContainElement(passwordField);
  });

  it("applies autofocus to the specified field", () => {
    setup({
      autofocusFieldName: "host",
    });

    const hostField = screen.getByLabelText("Host");
    expect(hostField).toHaveFocus();
  });

  it("handles empty fields array", () => {
    setup({ fields: [] });

    // Should not find any form fields
    expect(screen.queryByRole("input")).not.toBeInTheDocument();
  });

  it("handles fields where only one of host/port is present", () => {
    const fieldsWithOnlyHost = [
      createMockEngineField({ name: "host", "display-name": "Host" }),
      createMockEngineField({ name: "user", "display-name": "Username" }),
    ];

    setup({
      fields: fieldsWithOnlyHost,
    });

    expect(screen.getByLabelText("Host")).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();

    expect(screen.queryByTestId("host-and-port")).not.toBeInTheDocument();
  });

  it("preserves field order when grouping", () => {
    const orderedFields = [
      createMockEngineField({ name: "user", "display-name": "Username" }),
      createMockEngineField({ name: "host", "display-name": "Host" }),
      createMockEngineField({ name: "password", "display-name": "Password" }),
      createMockEngineField({ name: "port", "display-name": "Port" }),
      createMockEngineField({ name: "database", "display-name": "Database" }),
    ];

    setup({ fields: orderedFields });

    const allInputs = screen.getAllByRole("textbox");
    const fieldLabels = allInputs.map((input) => input.getAttribute("title"));

    expect(fieldLabels).toEqual([
      "Username",
      "Host",
      "Port",
      "Password",
      "Database",
    ]);
  });

  it("passes correct props to DatabaseDetailField", () => {
    setup({
      autofocusFieldName: "port",
    });

    const portField = screen.getByLabelText("Port");

    expect(portField).toBeInTheDocument();
    expect(portField).toHaveFocus();
  });
});
