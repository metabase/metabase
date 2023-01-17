import React from "react";
import _ from "underscore";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type {
  ActionFormSettings,
  FieldSettings,
  ParametersForActionExecution,
  WritebackParameter,
} from "metabase-types/api";
import { createMockActionParameter } from "metabase-types/api/mocks";

import { ActionForm } from "./ActionForm";

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
  initialValues?: ParametersForActionExecution;
  parameters: WritebackParameter[];
  formSettings: ActionFormSettings;
  isSettings?: boolean;
};

const setup = ({
  initialValues,
  parameters,
  formSettings,
  isSettings = false,
}: SetupOpts) => {
  const setFormSettings = jest.fn();
  const onSubmit = jest.fn();

  render(
    <ActionForm
      initialValues={initialValues}
      parameters={parameters}
      formSettings={formSettings}
      setFormSettings={isSettings ? setFormSettings : undefined}
      onSubmit={onSubmit}
    />,
  );

  return { setFormSettings, onSubmit };
};

function setupSettings(opts: Omit<SetupOpts, "isSettings">) {
  return setup({ ...opts, isSettings: true });
}

describe("Actions > ActionForm", () => {
  describe("Form Display", () => {
    it("displays a form with am input label", () => {
      setup({
        parameters: [makeParameter()],
        formSettings: {
          type: "form",
          fields: {
            "abc-123": makeFieldSettings({ inputType: "string" }),
          },
        },
      });

      expect(screen.getByRole("form")).toBeInTheDocument();
      expect(screen.getByTestId("action-form")).toBeInTheDocument();
      expect(screen.getByLabelText(/form field name/i)).toBeInTheDocument();
    });

    it("displays a text input", () => {
      setup({
        parameters: [makeParameter()],
        formSettings: {
          type: "form",
          fields: {
            "abc-123": makeFieldSettings({ inputType: "string" }),
          },
        },
      });

      expect(
        screen.getByLabelText(/form field name/i, { selector: "input" }),
      ).toHaveAttribute("type", "text");
    });

    it("displays a numeric input", () => {
      setup({
        parameters: [makeParameter()],
        formSettings: {
          type: "form",
          fields: {
            "abc-123": makeFieldSettings({ inputType: "number" }),
          },
        },
      });

      expect(
        screen.getByLabelText(/form field name/i, { selector: "input" }),
      ).toHaveAttribute("type", "number");
    });

    it("displays a textarea input", () => {
      setup({
        parameters: [makeParameter()],
        formSettings: {
          type: "form",
          fields: {
            "abc-123": makeFieldSettings({ inputType: "text" }),
          },
        },
      });

      expect(
        screen.getByLabelText(/form field name/i, { selector: "textarea" }),
      ).toBeInTheDocument();
    });

    it("displays a boolean input", () => {
      setup({
        parameters: [makeParameter()],
        formSettings: {
          type: "form",
          fields: {
            "abc-123": makeFieldSettings({ inputType: "boolean" }),
          },
        },
      });

      expect(screen.getByRole("switch")).toBeInTheDocument();
    });

    it("displays a date input", () => {
      setup({
        parameters: [makeParameter()],
        formSettings: {
          type: "form",
          fields: {
            "abc-123": makeFieldSettings({ inputType: "date" }),
          },
        },
      });

      expect(
        screen.getByLabelText(/form field name/i, { selector: "input" }),
      ).toHaveAttribute("type", "date");
    });

    it("displays a time input", () => {
      setup({
        parameters: [makeParameter()],
        formSettings: {
          type: "form",
          fields: {
            "abc-123": makeFieldSettings({ inputType: "time" }),
          },
        },
      });

      expect(
        screen.getByLabelText(/form field name/i, { selector: "input" }),
      ).toHaveAttribute("type", "time");
    });

    it("displays a datetime input", () => {
      setup({
        parameters: [makeParameter()],
        formSettings: {
          type: "form",
          fields: {
            "abc-123": makeFieldSettings({ inputType: "datetime" }),
          },
        },
      });

      expect(
        screen.getByLabelText(/form field name/i, { selector: "input" }),
      ).toHaveAttribute("type", "datetime-local");
    });

    it("displays a radio input", () => {
      setup({
        parameters: [makeParameter()],
        formSettings: {
          type: "form",
          fields: {
            "abc-123": makeFieldSettings({ inputType: "radio" }),
          },
        },
      });

      expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    });

    it("displays a select input", () => {
      setup({
        parameters: [makeParameter()],
        formSettings: {
          type: "form",
          fields: {
            "abc-123": makeFieldSettings({ inputType: "select" }),
          },
        },
      });

      expect(screen.getByTestId("select-button")).toBeInTheDocument();
    });

    it("can submit form field values", async () => {
      const { onSubmit } = setup({
        parameters: [
          makeParameter({ id: "abc-123" }),
          makeParameter({ id: "def-456" }),
        ],
        formSettings: {
          type: "form",
          fields: {
            "abc-123": makeFieldSettings({
              inputType: "string",
              id: "abc-123",
              title: "text input",
            }),
            "def-456": makeFieldSettings({
              inputType: "number",
              id: "def-456",
              title: "number input",
            }),
          },
        },
      });

      userEvent.type(screen.getByLabelText(/text input/i), "Murloc");
      userEvent.type(screen.getByLabelText(/number input/i), "12345");
      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          {
            "abc-123": "Murloc",
            "def-456": 12345,
          },
          expect.any(Object),
        );
      });
    });
  });

  describe("Form Validation", () => {
    it("allows form submission when required fields are provided", async () => {
      const { onSubmit } = setup({
        parameters: [
          makeParameter({ id: "abc-123" }),
          makeParameter({ id: "def-456" }),
        ],
        formSettings: {
          type: "form",
          fields: {
            "abc-123": makeFieldSettings({
              inputType: "string",
              id: "abc-123",
              title: "foo input",
              required: true,
            }),
            "def-456": makeFieldSettings({
              inputType: "string",
              id: "def-456",
              title: "bar input",
              required: false,
            }),
          },
        },
      });

      userEvent.type(await screen.findByLabelText(/foo input/i), "baz");
      userEvent.type(await screen.findByLabelText(/bar input/i), "baz");
      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(
        screen.queryByText(/this field is required/i),
      ).not.toBeInTheDocument();
    });

    it("disables form submission when required fields are not provided", async () => {
      const { onSubmit } = setup({
        parameters: [
          makeParameter({ id: "abc-123" }),
          makeParameter({ id: "def-456" }),
        ],
        formSettings: {
          type: "form",
          fields: {
            "abc-123": makeFieldSettings({
              inputType: "string",
              id: "abc-123",
              title: "foo input",
              required: true,
            }),
            "def-456": makeFieldSettings({
              inputType: "string",
              id: "def-456",
              title: "bar input",
              required: false,
            }),
          },
        },
      });

      userEvent.click(await screen.findByLabelText(/foo input/i)); // leave empty
      userEvent.type(await screen.findByLabelText(/bar input/i), "baz");
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled(),
      );

      userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(
        await screen.findByText(/this field is required/i),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("disables form submission when no fields are changed", async () => {
      const { onSubmit } = setup({
        parameters: [
          makeParameter({ id: "abc-123" }),
          makeParameter({ id: "def-456" }),
        ],
        formSettings: {
          type: "form",
          fields: {
            "abc-123": makeFieldSettings({
              inputType: "string",
              id: "abc-123",
              title: "foo input",
              required: false,
            }),
            "def-456": makeFieldSettings({
              inputType: "string",
              id: "def-456",
              title: "bar input",
              required: false,
            }),
          },
        },
      });

      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
    });

    it("cannot type a string in a numeric field", async () => {
      setup({
        parameters: [makeParameter()],
        formSettings: {
          type: "form",
          fields: {
            "abc-123": makeFieldSettings({ inputType: "number" }),
          },
        },
      });

      const input = await screen.findByLabelText(/form field name/i);
      userEvent.type(input, "baz");

      await waitFor(() => expect(input).not.toHaveValue());
    });

    it("allows submission of a null non-required boolean field", async () => {
      const { onSubmit } = setup({
        parameters: [
          makeParameter({ id: "abc-123" }),
          makeParameter({ id: "def-456" }),
        ],
        formSettings: {
          type: "form",
          fields: {
            "abc-123": makeFieldSettings({
              inputType: "string",
              id: "abc-123",
              title: "foo input",
              required: true,
            }),
            "def-456": makeFieldSettings({
              inputType: "boolean",
              id: "def-456",
              title: "bar input",
              required: false,
            }),
          },
        },
      });

      userEvent.type(await screen.findByLabelText(/foo input/i), "baz");
      userEvent.type(await screen.findByLabelText(/bar input/i), "baz");
      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(
        screen.queryByText(/this field is required/i),
      ).not.toBeInTheDocument();
    });

    it("sets a default value for an empty field", async () => {
      const { onSubmit } = setup({
        parameters: [
          makeParameter({ id: "abc-123" }),
          makeParameter({ id: "def-456" }),
        ],
        formSettings: {
          type: "form",
          fields: {
            "abc-123": makeFieldSettings({
              inputType: "string",
              id: "abc-123",
              title: "foo input",
              required: true,
            }),
            "def-456": makeFieldSettings({
              inputType: "boolean",
              id: "def-456",
              title: "bar input",
              required: false,
            }),
          },
        },
      });

      userEvent.type(await screen.findByLabelText(/foo input/i), "baz");
      userEvent.type(await screen.findByLabelText(/bar input/i), "baz");
      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(
        screen.queryByText(/this field is required/i),
      ).not.toBeInTheDocument();
    });

    it("sets types on form submissions correctly", async () => {
      const { onSubmit } = setup({
        parameters: [
          makeParameter({ id: "abc-123" }),
          makeParameter({ id: "def-456" }),
          makeParameter({ id: "ghi-789" }),
        ],
        formSettings: {
          type: "form",
          fields: {
            "abc-123": makeFieldSettings({
              inputType: "string",
              id: "abc-123",
              title: "foo input",
              required: false,
            }),
            "def-456": makeFieldSettings({
              inputType: "boolean",
              id: "def-456",
              title: "bar input",
              required: false,
            }),
            "ghi-789": makeFieldSettings({
              inputType: "number",
              id: "ghi-789",
              title: "baz input",
              required: false,
            }),
          },
        },
      });

      userEvent.type(await screen.findByLabelText(/foo input/i), "1");
      userEvent.type(await screen.findByLabelText(/bar input/i), "1");
      userEvent.type(await screen.findByLabelText(/baz input/i), "1");
      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          {
            "abc-123": "1",
            "def-456": true,
            "ghi-789": 1,
          },
          expect.anything(),
        );
      });
    });
  });

  // this may not be the final desired behavior, but it's what we have for now
  describe("Null Handling", () => {
    const inputTypes = ["string", "number", "text", "date", "datetime", "time"];
    inputTypes.forEach(inputType => {
      it(`casts empty optional ${inputType} field to null`, async () => {
        const { onSubmit } = setup({
          initialValues: { "abc-123": 1 },
          parameters: [makeParameter({ id: "abc-123" })],
          formSettings: {
            type: "form",
            fields: {
              "abc-123": makeFieldSettings({
                inputType: inputType as FieldSettings["inputType"],
                id: "abc-123",
                title: "input",
                required: false,
              }),
            },
          },
        });

        // userEvent.clear doesn't work for date or time inputs 🤷
        fireEvent.change(screen.getByLabelText(/input/i), {
          target: { value: "" },
        });
        userEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() => {
          expect(onSubmit).toHaveBeenCalledWith(
            {
              "abc-123": null,
            },
            expect.any(Object),
          );
        });
      });
    });

    // bug repro: https://github.com/metabase/metabase/issues/27377
    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("casts empty optional category fields to null", async () => {
      const { onSubmit } = setup({
        initialValues: { "abc-123": "aaa" },
        parameters: [makeParameter({ id: "abc-123" })],
        formSettings: {
          type: "form",
          fields: {
            "abc-123": makeFieldSettings({
              inputType: "category",
              id: "abc-123",
              title: "input",
              required: false,
            }),
          },
        },
      });

      userEvent.clear(screen.getByLabelText(/input/i));
      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          {
            "abc-123": null,
          },
          expect.any(Object),
        );
      });
    });
  });

  describe("Form Creation", () => {
    it("renders the form editor", () => {
      setupSettings({
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
      const { setFormSettings } = setupSettings({
        parameters: [makeParameter()],
        formSettings,
      });

      // click the settings cog then the number input type
      userEvent.click(await screen.findByLabelText("gear icon"));
      userEvent.click(await screen.findByText("number"));

      await waitFor(() => {
        expect(setFormSettings).toHaveBeenCalledWith({
          ...formSettings,
          fields: {
            "abc-123": makeFieldSettings({
              fieldType: "number",
              inputType: "number",
            }),
          },
        });
      });
    });

    it("can change a string field to a text(area) field", async () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "string" }),
        },
      };

      const { setFormSettings } = setupSettings({
        parameters: [makeParameter()],
        formSettings,
      });

      // click the settings cog then the number input type
      userEvent.click(await screen.findByLabelText("gear icon"));
      userEvent.click(await screen.findByText("long text"));

      await waitFor(() => {
        expect(setFormSettings).toHaveBeenCalledWith({
          ...formSettings,
          fields: {
            "abc-123": makeFieldSettings({
              fieldType: "string",
              inputType: "text",
            }),
          },
        });
      });
    });

    it("can change a numeric field to a date field", async () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "number" }),
        },
      };

      const { setFormSettings } = setupSettings({
        parameters: [makeParameter()],
        formSettings,
      });

      userEvent.click(await screen.findByLabelText("gear icon"));
      userEvent.click(await screen.findByText("date"));

      await waitFor(() => {
        expect(setFormSettings).toHaveBeenCalledWith({
          ...formSettings,
          fields: {
            "abc-123": makeFieldSettings({
              fieldType: "date",
              inputType: "date",
            }),
          },
        });
      });
    });

    it("can change a date field to a select field", async () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "date" }),
        },
      };
      const { setFormSettings } = setupSettings({
        parameters: [makeParameter()],
        formSettings,
      });

      userEvent.click(await screen.findByLabelText("gear icon"));
      userEvent.click(await screen.findByText("category"));

      await waitFor(() => {
        expect(setFormSettings).toHaveBeenCalledWith({
          ...formSettings,
          fields: {
            "abc-123": makeFieldSettings({
              fieldType: "category",
              inputType: "select",
            }),
          },
        });
      });
    });
    it("can toggle required state", async () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "string" }),
        },
      };
      const { setFormSettings } = setupSettings({
        parameters: [makeParameter()],
        formSettings,
      });

      userEvent.click(await screen.findByLabelText("gear icon"));
      userEvent.click(await screen.findByRole("switch"));

      await waitFor(() => {
        expect(setFormSettings).toHaveBeenCalledWith({
          ...formSettings,
          fields: {
            "abc-123": makeFieldSettings({
              required: true,
              inputType: "string",
            }),
          },
        });
      });
    });
  });
});
