import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type {
  ActionFormSettings,
  FieldSettings,
  WritebackParameter,
} from "metabase-types/api";
import {
  createMockActionParameter,
  createMockImplicitActionFieldSettings,
} from "metabase-types/api/mocks";

import FormCreator from "./FormCreator";

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
  isPublic?: boolean;
};

const setup = ({ parameters, formSettings, isPublic = false }: SetupOpts) => {
  const onChange = jest.fn();

  render(
    <FormCreator
      parameters={parameters}
      formSettings={formSettings}
      isEditable
      isPublic={isPublic}
      onChange={onChange}
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

  it("can change a string field to a numeric field", () => {
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

    userEvent.click(
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
    userEvent.click(screen.getByLabelText("Field settings"));
    userEvent.click(await screen.findByText("Long text"));

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

  it("can change a numeric field to a date field", () => {
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

    userEvent.click(
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

    userEvent.click(
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

    userEvent.click(screen.getByLabelText("Field settings"));
    userEvent.click(await screen.findByRole("switch"));

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
    describe.each([{ isPublic: true }, { isPublic: false }])(
      "when public: $isPublic",
      ({ isPublic }) => {
        describe("when there is hidden, required parameter without default value", () => {
          it("shows a warning banner for query action", () => {
            const parameter = makeParameter({ required: true });
            const fieldSettings = makeFieldSettings({
              inputType: "string",
              required: true,
              defaultValue: undefined,
              hidden: true,
            });

            setup({
              parameters: [parameter],
              formSettings: {
                type: "form",
                fields: {
                  [parameter.id]: fieldSettings,
                },
              },
              isPublic,
            });

            expect(
              screen.getByTestId("action-warning-banner"),
            ).toBeInTheDocument();
          });

          it("shows a warning banner for implicit action", () => {
            const parameter = makeParameter({ required: true });
            const fieldSettings = createMockImplicitActionFieldSettings({
              id: parameter.id,
              required: true,
              defaultValue: undefined,
              hidden: true,
            });

            setup({
              parameters: [parameter],
              formSettings: {
                type: "form",
                fields: {
                  [parameter.id]: fieldSettings,
                },
              },
              isPublic,
            });

            expect(
              screen.getByTestId("action-warning-banner"),
            ).toBeInTheDocument();
          });
        });
      },
    );

    describe.each([{ isPublic: true }, { isPublic: false }])(
      "when public: $isPublic",
      ({ isPublic }) => {
        describe.each([
          { required: false, hidden: false, hasDefaultValue: false },
          { required: false, hidden: false, hasDefaultValue: true },
          { required: false, hidden: true, hasDefaultValue: false },
          { required: false, hidden: true, hasDefaultValue: true },
          { required: true, hidden: false, hasDefaultValue: false },
          { required: true, hidden: false, hasDefaultValue: true },
          { required: true, hidden: true, hasDefaultValue: true },
        ])(
          `when there is no hidden, required parameter without default value`,
          ({ required, hidden, hasDefaultValue }) => {
            it("does not show a warning banner for query action", () => {
              const defaultValue = "foo bar";
              const parameter = makeParameter({ required });
              const fieldSettings = makeFieldSettings({
                id: parameter.id,
                inputType: "string",
                required,
                defaultValue: hasDefaultValue ? defaultValue : undefined,
                hidden,
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

              expect(
                screen.queryByTestId("action-warning-banner"),
              ).not.toBeInTheDocument();
            });

            it("doesn't show a banner for implicit action", () => {
              const defaultValue = "foo bar";
              const parameter = makeParameter({ required });
              const fieldSettings = createMockImplicitActionFieldSettings({
                id: parameter.id,
                required,
                defaultValue: hasDefaultValue ? defaultValue : undefined,
                hidden,
              });

              setup({
                parameters: [parameter],
                formSettings: {
                  type: "form",
                  fields: {
                    [parameter.id]: fieldSettings,
                  },
                },
                isPublic,
              });

              expect(
                screen.queryByTestId("action-warning-banner"),
              ).not.toBeInTheDocument();
            });
          },
        );
      },
    );
  });
});
