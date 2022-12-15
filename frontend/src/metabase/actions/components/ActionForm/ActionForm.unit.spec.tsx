import React from "react";
import _ from "underscore";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { act } from "react-dom/test-utils";
import type {
  ActionFormProps,
  ActionFormSettings,
  FieldSettings,
  WritebackParameter,
} from "metabase-types/api";
import type { Parameter } from "metabase-types/types/Parameter";

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

      const { container } = render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={_.noop}
        />,
      );

      const el = container.querySelector('input[type="text"]');
      expect(el).toBeInTheDocument();
    });

    it("displays a numeric input", () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "number" }),
        },
      };
      const params = [makeParameter()];

      const { container } = render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={_.noop}
        />,
      );

      const el = container.querySelector('input[type="number"]');
      expect(el).toBeInTheDocument();
    });

    it("displays a textarea input", () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "text" }),
        },
      };
      const params = [makeParameter()];

      const { container } = render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={_.noop}
        />,
      );

      const el = container.querySelector("textarea");
      expect(el).toBeInTheDocument();
    });

    it("displays a boolean input", () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "boolean" }),
        },
      };
      const params = [makeParameter()];

      const { container } = render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={_.noop}
        />,
      );
      screen.getByRole("switch");
    });

    it("displays a date input", () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "date" }),
        },
      };
      const params = [makeParameter()];

      const { container } = render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={_.noop}
        />,
      );

      const el = container.querySelector('input[type="date"]');
      expect(el).toBeInTheDocument();
    });

    it("displays a time input", () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "time" }),
        },
      };
      const params = [makeParameter()];

      const { container } = render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={_.noop}
        />,
      );

      const el = container.querySelector('input[type="time"]');
      expect(el).toBeInTheDocument();
    });

    it("displays a datetime input", () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "datetime" }),
        },
      };
      const params = [makeParameter()];

      const { container } = render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={_.noop}
        />,
      );

      const el = container.querySelector('input[type="datetime-local"]');
      expect(el).toBeInTheDocument();
    });

    it("displays a radio input", () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "radio" }),
        },
      };
      const params = [makeParameter()];

      const { container } = render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={_.noop}
        />,
      );

      const el = container.querySelector('input[type="radio"]');
      expect(el).toBeInTheDocument();
    });

    it("displays a select input", () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "select" }),
        },
      };
      const params = [makeParameter()];

      const { container } = render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={_.noop}
        />,
      );

      screen.getByTestId("select-button");
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

      await act(async () => {
        await userEvent.type(screen.getByLabelText(/text input/i), "Murloc", {
          delay: 1,
        });
        await userEvent.type(screen.getByLabelText(/number input/i), "12345");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
      });

      expect(submitSpy).toHaveBeenCalledWith(
        {
          "abc-123": "Murloc",
          "def-456": 12345,
        },
        expect.any(Object),
      );
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

      await act(async () => {
        await userEvent.type(await screen.findByLabelText(/foo input/i), "baz");
        await userEvent.type(await screen.findByLabelText(/bar input/i), "baz");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
      });

      expect(
        screen.queryByText(/this field is required/i),
      ).not.toBeInTheDocument();
      expect(submitSpy).toHaveBeenCalled();
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

      await act(async () => {
        await userEvent.click(await screen.findByLabelText(/foo input/i)); // leave empty
        await userEvent.type(await screen.findByLabelText(/bar input/i), "baz");
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
      });

      expect(screen.queryByText(/this field is required/i)).toBeInTheDocument();
      expect(submitSpy).not.toHaveBeenCalled();
    });

    it("cannot type a string in a numeric field", async () => {
      const formSettings: ActionFormSettings = {
        type: "form",
        fields: {
          "abc-123": makeFieldSettings({ inputType: "number" }),
        },
      };
      const params = [makeParameter()];

      const { container } = render(
        <ActionForm
          parameters={params as WritebackParameter[]}
          formSettings={formSettings}
          onSubmit={_.noop}
        />,
      );

      await act(async () => {
        await userEvent.type(
          await screen.findByLabelText(/form field name/i),
          "baz",
        );
      });

      expect(container.querySelector("input")?.value).toBe("");
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

      await act(async () => {
        await userEvent.type(await screen.findByLabelText(/foo input/i), "baz");
        await userEvent.type(await screen.findByLabelText(/bar input/i), "baz");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
      });

      expect(
        screen.queryByText(/this field is required/i),
      ).not.toBeInTheDocument();
      expect(submitSpy).toHaveBeenCalled();
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

      await act(async () => {
        await userEvent.type(await screen.findByLabelText(/foo input/i), "baz");
        await userEvent.type(await screen.findByLabelText(/bar input/i), "baz");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
      });

      expect(
        screen.queryByText(/this field is required/i),
      ).not.toBeInTheDocument();
      expect(submitSpy).toHaveBeenCalled();
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

      await act(async () => {
        await userEvent.type(await screen.findByLabelText(/foo input/i), "1");
        await userEvent.type(await screen.findByLabelText(/bar input/i), "1");
        await userEvent.type(await screen.findByLabelText(/baz input/i), "1");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
      });

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

      await act(async () => {
        // click the settings cog then the number input type
        await userEvent.click(await screen.findByLabelText("gear icon"));
        await userEvent.click(await screen.findByText("number"));
      });

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

      await act(async () => {
        // click the settings cog then the number input type
        await userEvent.click(await screen.findByLabelText("gear icon"));
        await userEvent.click(await screen.findByText("long text"));
      });

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

      await act(async () => {
        await userEvent.click(await screen.findByLabelText("gear icon"));
        await userEvent.click(await screen.findByText("date"));
      });

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

      await act(async () => {
        await userEvent.click(await screen.findByLabelText("gear icon"));
        await userEvent.click(await screen.findByText("category"));
      });

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

      await act(async () => {
        await userEvent.click(await screen.findByLabelText("gear icon"));
        await userEvent.click(await screen.findByRole("switch"));
      });

      expect(changeSpy).toHaveBeenCalledWith({
        ...formSettings,
        fields: {
          "abc-123": makeFieldSettings({ required: true, inputType: "string" }),
        },
      });
    });
  });
});
