import React from "react";
import _ from "underscore";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  wait,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type {
  ActionFormSettings,
  FieldSettings,
  WritebackParameter,
} from "metabase-types/api";

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

const makeParameter = (
  overrides?: Partial<WritebackParameter>,
): Partial<WritebackParameter> => {
  const id = overrides?.id ?? "abc-123";
  return {
    id,
    required: false,
    target: ["variable", ["template-tag", id]],
    type: "type/Text",
    ...overrides,
  };
};

describe("Actions > ActionForm", () => {
  describe("Form Display", () => {
    it("displays a form with am input label", () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "string" }),
        },
      };
      const params = [makeParameter()];

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={_.noop}
        />,
      );

      expect(screen.getByRole("form")).toBeInTheDocument();
      expect(screen.getByTestId("action-form")).toBeInTheDocument();
      expect(screen.getByLabelText(/form field name/i)).toBeInTheDocument();
    });

    it("displays a text input", () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "string" }),
        },
      };
      const params = [makeParameter()];

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={_.noop}
        />,
      );

      expect(
        screen.getByLabelText(/form field name/i, { selector: "input" }),
      ).toHaveAttribute("type", "text");
    });

    it("displays a numeric input", () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "number" }),
        },
      };
      const params = [makeParameter()];

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={_.noop}
        />,
      );

      expect(
        screen.getByLabelText(/form field name/i, { selector: "input" }),
      ).toHaveAttribute("type", "number");
    });

    it("displays a textarea input", () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "text" }),
        },
      };
      const params = [makeParameter()];

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={_.noop}
        />,
      );

      expect(
        screen.getByLabelText(/form field name/i, { selector: "textarea" }),
      ).toBeInTheDocument();
    });

    it("displays a boolean input", () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "boolean" }),
        },
      };
      const params = [makeParameter()];

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={_.noop}
        />,
      );

      expect(screen.getByRole("switch")).toBeInTheDocument();
    });

    it("displays a date input", () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "date" }),
        },
      };
      const params = [makeParameter()];

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={_.noop}
        />,
      );

      expect(
        screen.getByLabelText(/form field name/i, { selector: "input" }),
      ).toHaveAttribute("type", "date");
    });

    it("displays a time input", () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "time" }),
        },
      };
      const params = [makeParameter()];

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={_.noop}
        />,
      );

      expect(
        screen.getByLabelText(/form field name/i, { selector: "input" }),
      ).toHaveAttribute("type", "time");
    });

    it("displays a datetime input", () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "datetime" }),
        },
      };
      const params = [makeParameter()];

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={_.noop}
        />,
      );

      expect(
        screen.getByLabelText(/form field name/i, { selector: "input" }),
      ).toHaveAttribute("type", "datetime-local");
    });

    it("displays a radio input", () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "radio" }),
        },
      };
      const params = [makeParameter()];

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={_.noop}
        />,
      );

      expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    });

    it("displays a select input", () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "select" }),
        },
      };
      const params = [makeParameter()];

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={_.noop}
        />,
      );

      expect(screen.getByTestId("select-button")).toBeInTheDocument();
    });

    it("can submit form field values", async () => {
      const formSettings: ActionFormSettings = {
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
      };
      const params = [
        makeParameter({ id: "abc-123" }),
        makeParameter({ id: "def-456" }),
      ];

      const submitSpy = jest.fn();

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={submitSpy}
        />,
      );

      userEvent.type(screen.getByLabelText(/text input/i), "Murloc");
      userEvent.type(screen.getByLabelText(/number input/i), "12345");
      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(submitSpy).toHaveBeenCalledWith(
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
      const formSettings: ActionFormSettings = {
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
      };
      const params = [
        makeParameter({ id: "abc-123" }),
        makeParameter({ id: "def-456" }),
      ];

      const submitSpy = jest.fn();

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={submitSpy}
        />,
      );

      userEvent.type(await screen.findByLabelText(/foo input/i), "baz");
      userEvent.type(await screen.findByLabelText(/bar input/i), "baz");
      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(submitSpy).toHaveBeenCalled());
      expect(
        screen.queryByText(/this field is required/i),
      ).not.toBeInTheDocument();
    });

    it("disables form submission when required fields are not provided", async () => {
      const formSettings: ActionFormSettings = {
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
      };
      const params = [
        makeParameter({ id: "abc-123" }),
        makeParameter({ id: "def-456" }),
      ];

      const submitSpy = jest.fn();

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={submitSpy}
        />,
      );

      userEvent.click(await screen.findByLabelText(/foo input/i)); // leave empty
      userEvent.type(await screen.findByLabelText(/bar input/i), "baz");
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled(),
      );

      userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(
        await screen.findByText(/this field is required/i),
      ).toBeInTheDocument();
      expect(submitSpy).not.toHaveBeenCalled();
    });

    it("disables form submission when no fields are changed", async () => {
      const formSettings: ActionFormSettings = {
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
      };
      const params = [
        makeParameter({ id: "abc-123" }),
        makeParameter({ id: "def-456" }),
      ];

      const submitSpy = jest.fn();

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={submitSpy}
        />,
      );

      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(submitSpy).not.toHaveBeenCalled());
    });

    it("cannot type a string in a numeric field", async () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "number" }),
        },
      };
      const params = [makeParameter()];

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={_.noop}
        />,
      );

      const input = await screen.findByLabelText(/form field name/i);
      userEvent.type(input, "baz");

      await waitFor(() => expect(input).toHaveValue(null));
    });

    it("allows submission of a null non-required boolean field", async () => {
      const formSettings: ActionFormSettings = {
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
      };
      const params = [
        makeParameter({ id: "abc-123" }),
        makeParameter({ id: "def-456" }),
      ];

      const submitSpy = jest.fn();

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={submitSpy}
        />,
      );

      userEvent.type(await screen.findByLabelText(/foo input/i), "baz");
      userEvent.type(await screen.findByLabelText(/bar input/i), "baz");
      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(submitSpy).toHaveBeenCalled());
      expect(
        screen.queryByText(/this field is required/i),
      ).not.toBeInTheDocument();
    });

    it("sets a default value for an empty field", async () => {
      const formSettings: ActionFormSettings = {
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
      };
      const params = [
        makeParameter({ id: "abc-123" }),
        makeParameter({ id: "def-456" }),
      ];

      const submitSpy = jest.fn();

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={submitSpy}
        />,
      );

      userEvent.type(await screen.findByLabelText(/foo input/i), "baz");
      userEvent.type(await screen.findByLabelText(/bar input/i), "baz");
      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(submitSpy).toHaveBeenCalled());
      expect(
        screen.queryByText(/this field is required/i),
      ).not.toBeInTheDocument();
    });

    it("sets types on form submissions correctly", async () => {
      const formSettings: ActionFormSettings = {
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
      };
      const params = [
        makeParameter({ id: "abc-123" }),
        makeParameter({ id: "def-456" }),
        makeParameter({ id: "ghi-789" }),
      ];

      const submitSpy = jest.fn();

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={submitSpy}
        />,
      );

      userEvent.type(await screen.findByLabelText(/foo input/i), "1");
      userEvent.type(await screen.findByLabelText(/bar input/i), "1");
      userEvent.type(await screen.findByLabelText(/baz input/i), "1");
      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(submitSpy).toHaveBeenCalledWith(
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
        const formSettings: ActionFormSettings = {
          type: "form",
          fields: {
            "abc-123": makeFieldSettings({
              inputType: inputType as FieldSettings["inputType"],
              id: "abc-123",
              title: "input",
              required: false,
            }),
          },
        };
        const params = [makeParameter({ id: "abc-123" })];

        const submitSpy = jest.fn();

        render(
          <ActionForm
            parameters={params as WritebackParameter[]}
            initialValues={{ "abc-123": 1 }}
            formSettings={formSettings}
            onSubmit={submitSpy}
          />,
        );

        // userEvent.clear doesn't work for date or time inputs 🤷
        fireEvent.change(screen.getByLabelText(/input/i), {
          target: { value: "" },
        });
        userEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() => {
          expect(submitSpy).toHaveBeenCalledWith(
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
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({
            inputType: "category",
            id: "abc-123",
            title: "input",
            required: false,
          }),
        },
      };
      const params = [makeParameter({ id: "abc-123" })];

      const submitSpy = jest.fn();

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          initialValues={{ "abc-123": "aaa" }}
          formSettings={formSettings}
          onSubmit={submitSpy}
        />,
      );

      userEvent.clear(screen.getByLabelText(/input/i));
      userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(submitSpy).toHaveBeenCalledWith(
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
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "string" }),
        },
      };
      const params = [makeParameter()];

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          setFormSettings={jest.fn()}
          onSubmit={() => undefined}
        />,
      );

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
      const params = [makeParameter()];

      const changeSpy = jest.fn();

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          setFormSettings={changeSpy}
          onSubmit={() => undefined}
        />,
      );

      // click the settings cog then the number input type
      userEvent.click(await screen.findByLabelText("gear icon"));
      1;
      userEvent.click(await screen.findByText("number"));
      1;

      await waitFor(() => {
        expect(changeSpy).toHaveBeenCalledWith({
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
      const params = [makeParameter()];

      const changeSpy = jest.fn();

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          setFormSettings={changeSpy}
          onSubmit={() => undefined}
        />,
      );

      // click the settings cog then the number input type
      userEvent.click(await screen.findByLabelText("gear icon"));
      userEvent.click(await screen.findByText("long text"));

      await waitFor(() => {
        expect(changeSpy).toHaveBeenCalledWith({
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
      const params = [makeParameter()];

      const changeSpy = jest.fn();

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          setFormSettings={changeSpy}
          onSubmit={() => undefined}
        />,
      );

      userEvent.click(await screen.findByLabelText("gear icon"));
      userEvent.click(await screen.findByText("date"));

      await waitFor(() => {
        expect(changeSpy).toHaveBeenCalledWith({
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
      const params = [makeParameter()];

      const changeSpy = jest.fn();

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          setFormSettings={changeSpy}
          onSubmit={() => undefined}
        />,
      );

      userEvent.click(await screen.findByLabelText("gear icon"));
      userEvent.click(await screen.findByText("category"));

      await waitFor(() => {
        expect(changeSpy).toHaveBeenCalledWith({
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
      const params = [makeParameter()];

      const changeSpy = jest.fn();

      render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          setFormSettings={changeSpy}
          onSubmit={() => undefined}
        />,
      );

      userEvent.click(await screen.findByLabelText("gear icon"));
      userEvent.click(await screen.findByRole("switch"));

      await waitFor(() => {
        expect(changeSpy).toHaveBeenCalledWith({
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
