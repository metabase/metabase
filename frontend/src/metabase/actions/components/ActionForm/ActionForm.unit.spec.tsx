import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type {
  ActionFormSettings,
  FieldSettings,
  ParametersForActionExecution,
  WritebackParameter,
} from "metabase-types/api";
import {
  createMockActionParameter,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import ActionForm from "./ActionForm";

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
  onSubmit?: () => Promise<void>;
};

const setup = ({
  initialValues,
  parameters,
  formSettings,
  onSubmit = jest.fn(),
}: SetupOpts) => {
  const action = createMockQueryAction({
    parameters,
    visualization_settings: formSettings,
  });

  render(
    <ActionForm
      action={action}
      initialValues={initialValues}
      onSubmit={onSubmit}
    />,
  );

  return { action, onSubmit };
};

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
      const { action, onSubmit } = setup({
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

      await userEvent.type(screen.getByLabelText(/text input/i), "Murloc");
      await userEvent.type(screen.getByLabelText(/number input/i), "12345");
      await userEvent.click(screen.getByRole("button", { name: action.name }));

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

    it("shows an error if submit fails", async () => {
      const message = "Something went wrong when submitting the form.";
      const error = { success: false, error: message, message };
      const { action } = await setup({
        onSubmit: jest.fn().mockRejectedValue(error),
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

      await userEvent.type(screen.getByLabelText(/text input/i), "Murloc");
      await userEvent.type(screen.getByLabelText(/number input/i), "12345");
      await userEvent.click(screen.getByRole("button", { name: action.name }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(
        await screen.findByRole("button", { name: /failed/i }),
      ).toHaveTextContent("Failed");
    });
  });

  describe("Form Validation", () => {
    it("allows form submission when required fields are provided", async () => {
      const { action, onSubmit } = setup({
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

      await userEvent.type(await screen.findByLabelText(/foo input/i), "baz");
      await userEvent.type(await screen.findByLabelText(/bar input/i), "baz");
      await userEvent.click(screen.getByRole("button", { name: action.name }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(screen.queryByText(/required/i)).not.toBeInTheDocument();
    });

    it("disables form submission when required fields are not provided", async () => {
      const { action, onSubmit } = setup({
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

      await userEvent.click(await screen.findByLabelText(/foo input/i)); // leave empty
      await userEvent.type(await screen.findByLabelText(/bar input/i), "baz");
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: action.name }),
        ).toBeDisabled(),
      );

      await userEvent.click(screen.getByRole("button", { name: action.name }));

      expect(await screen.findByText(/required/i)).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("allows form submission when all required fields are set", async () => {
      const { action, onSubmit } = setup({
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

      expect(screen.getByRole("button", { name: action.name })).toBeDisabled();

      await userEvent.type(screen.getByLabelText(/foo input/i), "baz");
      await waitFor(() => {
        expect(screen.getByRole("button", { name: action.name })).toBeEnabled();
      });

      await userEvent.click(screen.getByRole("button", { name: action.name }));
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled();
      });
    });

    it("allows form submission when all fields are optional", async () => {
      const { action, onSubmit } = setup({
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

      expect(screen.getByRole("button", { name: action.name })).toBeEnabled();

      await userEvent.click(screen.getByRole("button", { name: action.name }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
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
      await userEvent.type(input, "baz");

      await waitFor(() => expect(input).not.toHaveValue());
    });

    it("allows submission of a null non-required boolean field", async () => {
      const { action, onSubmit } = setup({
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

      await userEvent.type(await screen.findByLabelText(/foo input/i), "baz");
      await userEvent.type(await screen.findByLabelText(/bar input/i), "baz");
      await userEvent.click(screen.getByRole("button", { name: action.name }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(screen.queryByText(/required/i)).not.toBeInTheDocument();
    });

    it("sets a default value for an empty field", async () => {
      const { action, onSubmit } = setup({
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
              defaultValue: "foo",
            }),
            "def-456": makeFieldSettings({
              inputType: "boolean",
              id: "def-456",
              title: "bar input",
              required: false,
              defaultValue: "bar",
            }),
          },
        },
      });

      await userEvent.click(screen.getByRole("button", { name: action.name }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(screen.queryByText(/required/i)).not.toBeInTheDocument();
    });

    it("sets types on form submissions correctly", async () => {
      const { action, onSubmit } = setup({
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

      await userEvent.type(await screen.findByLabelText(/foo input/i), "1");
      await userEvent.type(await screen.findByLabelText(/bar input/i), "1");
      await userEvent.type(await screen.findByLabelText(/baz input/i), "1");
      await userEvent.click(screen.getByRole("button", { name: action.name }));

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
        const { action, onSubmit } = setup({
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
        await userEvent.click(
          screen.getByRole("button", { name: action.name }),
        );

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
      const { action, onSubmit } = setup({
        initialValues: { "abc-123": "aaa" },
        parameters: [makeParameter({ id: "abc-123" })],
        formSettings: {
          type: "form",
          fields: {
            "abc-123": makeFieldSettings({
              inputType: "string",
              id: "abc-123",
              title: "input",
              required: false,
            }),
          },
        },
      });

      await userEvent.clear(screen.getByLabelText(/input/i));
      await userEvent.click(screen.getByRole("button", { name: action.name }));

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
});
