import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type {
  ActionFormSettings,
  FieldSettings,
  WritebackAction,
  WritebackParameter,
} from "metabase-types/api";
import {
  createMockActionParameter,
  createMockImplicitActionFieldSettings,
} from "metabase-types/api/mocks";

import { FormCreator } from "./FormCreator";

const makeFieldSettings = (
  overrides: Partial<FieldSettings> = {},
): FieldSettings => ({
  id: "abc-123",
  name: "form field name",
  title: "form field name",
  order: 1,
  fieldType: "string",
  inputType: "string",
  required: false,
  hidden: false,
  ...overrides,
});

const makeParameter = ({
  id = "abc-123",
  ...params
}: Partial<WritebackParameter> = {}): WritebackParameter => {
  return createMockActionParameter({
    id,
    target: ["variable", ["template-tag", id]],
    type: "type/Text",
    required: false,
    ...params,
  });
};

type SetupOpts = {
  parameters: WritebackParameter[];
  formSettings: ActionFormSettings;
  actionType?: WritebackAction["type"];
};

const setup = ({ parameters, formSettings, actionType }: SetupOpts) => {
  const onChange = jest.fn();

  renderWithProviders(
    <FormCreator
      parameters={parameters}
      formSettings={formSettings}
      isEditable
      onChange={onChange}
      actionType={actionType || "query"}
    />,
  );

  return { onChange };
};

describe("actions > containers > ActionCreator > FormCreator", () => {
  it("renders the form editor", () => {
    setup({
      parameters: [makeParameter()],
      formSettings: {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "string" }),
        },
      },
    });

    expect(screen.getByTestId("action-form-editor")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("can change a string field to a numeric field", async () => {
    const formSettings: ActionFormSettings = {
      type: "form",
      fields: {
        "abc-123": makeFieldSettings({ inputType: "string" }),
      },
    };
    const { onChange } = setup({
      parameters: [makeParameter()],
      formSettings,
    });

    await userEvent.click(
      screen.getByRole("radio", {
        name: /number/i,
      }),
    );

    expect(onChange).toHaveBeenCalledWith({
      ...formSettings,
      fields: {
        "abc-123": makeFieldSettings({
          fieldType: "number",
          inputType: "number",
        }),
      },
    });
  });

  it("can change a string field to a text(area) field", async () => {
    const formSettings: ActionFormSettings = {
      type: "form",
      fields: {
        "abc-123": makeFieldSettings({ inputType: "string" }),
      },
    };

    const { onChange } = setup({
      parameters: [makeParameter()],
      formSettings,
    });

    // click the settings cog then the number input type
    await userEvent.click(screen.getByLabelText("Field settings"));
    await userEvent.click(await screen.findByText("Long text"));

    expect(onChange).toHaveBeenCalledWith({
      ...formSettings,
      fields: {
        "abc-123": makeFieldSettings({
          fieldType: "string",
          inputType: "text",
        }),
      },
    });
  });

  it("can change a numeric field to a date field", async () => {
    const formSettings: ActionFormSettings = {
      type: "form",
      fields: {
        "abc-123": makeFieldSettings({ inputType: "number" }),
      },
    };

    const { onChange } = setup({
      parameters: [makeParameter()],
      formSettings,
    });

    await userEvent.click(
      screen.getByRole("radio", {
        name: /date/i,
      }),
    );

    expect(onChange).toHaveBeenCalledWith({
      ...formSettings,
      fields: {
        "abc-123": makeFieldSettings({
          fieldType: "date",
          inputType: "date",
        }),
      },
    });
  });

  it("can change a date field to a number field", async () => {
    const formSettings: ActionFormSettings = {
      type: "form",
      fields: {
        "abc-123": makeFieldSettings({ inputType: "date" }),
      },
    };
    const { onChange } = setup({
      parameters: [makeParameter()],
      formSettings,
    });

    await userEvent.click(
      screen.getByRole("radio", {
        name: /number/i,
      }),
    );

    expect(onChange).toHaveBeenCalledWith({
      ...formSettings,
      fields: {
        "abc-123": makeFieldSettings({
          fieldType: "number",
          inputType: "number",
        }),
      },
    });
  });

  it("can toggle required state", async () => {
    const formSettings: ActionFormSettings = {
      type: "form",
      fields: {
        "abc-123": makeFieldSettings({ inputType: "string" }),
      },
    };
    const { onChange } = setup({
      parameters: [makeParameter()],
      formSettings,
    });

    await userEvent.click(screen.getByLabelText("Field settings"));
    await userEvent.click(await screen.findByRole("switch"));

    expect(onChange).toHaveBeenCalledWith({
      ...formSettings,
      fields: {
        "abc-123": makeFieldSettings({
          required: true,
          inputType: "string",
        }),
      },
    });
  });

  it("displays default values", () => {
    const defaultValue = "foo bar";
    const parameter = makeParameter();
    const fieldSettings = makeFieldSettings({
      inputType: "string",
      required: true,
      defaultValue,
    });
    setup({
      parameters: [parameter],
      formSettings: {
        type: "form",
        fields: {
          [parameter.id]: fieldSettings,
        },
      },
    });

    expect(screen.getByLabelText(fieldSettings.title)).toHaveValue(
      defaultValue,
    );
  });

  describe("Warning banner", () => {
    const WARNING_BANNER_TEXT =
      "Your action has a hidden required field with no default value. There's a good chance this will cause the action to fail.";

    describe("when there is hidden, required parameter without default value", () => {
      it("shows a warning banner for query action", () => {
        const parameter1 = makeParameter({ required: true });
        const parameter2 = makeParameter({ id: "2" });
        const fieldSettings = makeFieldSettings({
          inputType: "string",
          required: true,
          defaultValue: undefined,
          hidden: true,
        });

        setup({
          parameters: [parameter1, parameter2],
          formSettings: {
            type: "form",
            fields: {
              [parameter1.id]: fieldSettings,
              [parameter2.id]: { ...fieldSettings, id: parameter2.id },
            },
          },
        });

        expect(screen.getByText(WARNING_BANNER_TEXT)).toBeInTheDocument();
      });

      it("shows a warning banner for implicit action", () => {
        const parameter = makeParameter({ required: true });
        // implicit actions initially have only hidden and id fields
        const fieldSettings = createMockImplicitActionFieldSettings({
          id: parameter.id,
          hidden: true,
        });

        setup({
          actionType: "implicit",
          parameters: [parameter],
          formSettings: {
            type: "form",
            fields: {
              [parameter.id]: fieldSettings,
            },
          },
        });

        expect(screen.getByText(WARNING_BANNER_TEXT)).toBeInTheDocument();
      });
    });

    describe.each([
      { required: false, hidden: false, hasDefaultValue: false },
      { required: false, hidden: false, hasDefaultValue: true },
      { required: false, hidden: true, hasDefaultValue: false },
      { required: false, hidden: true, hasDefaultValue: true },
      { required: true, hidden: false, hasDefaultValue: false },
      { required: true, hidden: false, hasDefaultValue: true },
      { required: true, hidden: true, hasDefaultValue: true },
    ])(
      `when required: $required, hidden: $hidden, hasDefaultValue: $hasDefaultValue`,
      ({ required, hidden, hasDefaultValue }) => {
        it("does not show a warning banner for query action", () => {
          const defaultValue = "foo bar";
          const parameter1 = makeParameter({ required });
          const parameter2 = makeParameter({ id: "2", required });
          const fieldSettings = makeFieldSettings({
            id: parameter1.id,
            inputType: "string",
            required,
            defaultValue: hasDefaultValue ? defaultValue : undefined,
            hidden,
          });

          setup({
            parameters: [parameter1, parameter2],
            formSettings: {
              type: "form",
              fields: {
                [parameter1.id]: fieldSettings,
                [parameter2.id]: { ...fieldSettings, id: parameter2.id },
              },
            },
          });

          expect(
            screen.queryByText(WARNING_BANNER_TEXT),
          ).not.toBeInTheDocument();
        });
      },
    );

    describe.each([
      { required: false, hidden: false },
      { required: false, hidden: true },
      { required: true, hidden: false },
    ])(`when required: $required, hidden: $hidden`, ({ required, hidden }) => {
      it("doesn't show a banner for implicit action", () => {
        const parameter = makeParameter({ required });
        const fieldSettings = createMockImplicitActionFieldSettings({
          id: parameter.id,
          hidden,
        });

        setup({
          actionType: "implicit",
          parameters: [parameter],
          formSettings: {
            type: "form",
            fields: {
              [parameter.id]: fieldSettings,
            },
          },
        });

        expect(screen.queryByText(WARNING_BANNER_TEXT)).not.toBeInTheDocument();
      });
    });

    describe("when settings are not available (e.g. before action is saved)", () => {
      it("does not show a warning banner for query action", () => {
        setup({
          parameters: [makeParameter()],
          formSettings: {
            type: "form",
            fields: undefined,
          },
        });

        expect(screen.queryByText(WARNING_BANNER_TEXT)).not.toBeInTheDocument();
      });
    });

    describe("when there is no parameters", () => {
      it("does not show a warning banner for query action", () => {
        setup({
          parameters: [],
          formSettings: {
            type: "form",
            fields: {},
          },
        });

        expect(screen.queryByText(WARNING_BANNER_TEXT)).not.toBeInTheDocument();
      });
    });
  });
});
