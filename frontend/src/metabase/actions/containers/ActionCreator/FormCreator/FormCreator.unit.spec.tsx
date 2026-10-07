import { renderWithProviders, screen } from "__support__/ui";
import type {
  ActionFormSettings,
  FieldSettings,
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
};

const setup = ({ parameters, formSettings }: SetupOpts) => {
  const onChange = jest.fn();

  renderWithProviders(
    <FormCreator
      parameters={parameters}
      formSettings={formSettings}
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

    it("shows a warning banner when a required parameter is hidden", () => {
      const parameter = makeParameter({ required: true });
      // implicit actions initially have only hidden and id fields
      const fieldSettings = createMockImplicitActionFieldSettings({
        id: parameter.id,
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
      });

      expect(screen.getByText(WARNING_BANNER_TEXT)).toBeInTheDocument();
    });

    describe.each([
      { required: false, hidden: false },
      { required: false, hidden: true },
      { required: true, hidden: false },
    ])(`when required: $required, hidden: $hidden`, ({ required, hidden }) => {
      it("doesn't show a warning banner", () => {
        const parameter = makeParameter({ required });
        const fieldSettings = createMockImplicitActionFieldSettings({
          id: parameter.id,
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

        expect(screen.queryByText(WARNING_BANNER_TEXT)).not.toBeInTheDocument();
      });
    });

    it("does not show a warning banner when there are no parameters", () => {
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
