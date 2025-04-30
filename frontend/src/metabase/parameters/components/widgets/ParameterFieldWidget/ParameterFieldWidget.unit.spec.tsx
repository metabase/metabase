import userEvent from "@testing-library/user-event";

import {
  setupParameterSearchValuesEndpoint,
  setupParameterValuesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type Field from "metabase-lib/v1/metadata/Field";
import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { ParameterValues } from "metabase-types/api";
import { createMockParameterValues } from "metabase-types/api/mocks";

import { ParameterFieldWidget } from "./ParameterFieldWidget";

type SetupOpts = {
  parameter?: UiParameter;
  fields?: Field[];
  parameterValues?: ParameterValues;
  parameterSearchValues?: Record<string, ParameterValues>;
};

function setup({
  parameter = createMockUiParameter(),
  fields = [],
  parameterValues = createMockParameterValues(),
  parameterSearchValues = {},
}: SetupOpts = {}) {
  setupParameterValuesEndpoints(parameterValues);
  Object.entries(parameterSearchValues).forEach(([query, values]) => {
    setupParameterSearchValuesEndpoint(query, values);
  });

  const setValue = jest.fn();
  renderWithProviders(
    <ParameterFieldWidget
      parameter={parameter}
      fields={fields}
      setValue={setValue}
    />,
  );

  return { setValue };
}

describe("ParameterFieldWidget", () => {
  describe("list mode", () => {
    it("should submit a value on enter in single-value mode", async () => {
      const { setValue } = setup({
        parameter: createMockUiParameter({
          values_query_type: "list",
          values_source_type: "static-list",
          values_source_config: {
            values: [["foo"]],
          },
          hasVariableTemplateTagTarget: true,
        }),
        parameterValues: createMockParameterValues({
          values: [["foo"]],
        }),
      });

      const input = await screen.findByPlaceholderText("Search the list");
      await userEvent.type(input, "bar{enter}");
      expect(screen.getByText("bar")).toBeInTheDocument();
      expect(setValue).not.toHaveBeenCalled();

      await userEvent.click(screen.getByText("bar"));
      await userEvent.type(input, "{enter}");
      expect(setValue).toHaveBeenCalledWith(["bar"]);
    });

    it("should submit a value on enter in multi-value mode", async () => {
      const { setValue } = setup({
        parameter: createMockUiParameter({
          values_query_type: "list",
          values_source_type: "static-list",
          values_source_config: {
            values: [["foo"]],
          },
        }),
        parameterValues: createMockParameterValues({
          values: [["foo"]],
        }),
      });

      const input = await screen.findByPlaceholderText("Search the list");
      await userEvent.type(input, "bar{enter}");
      expect(screen.getByText("bar")).toBeInTheDocument();
      expect(setValue).not.toHaveBeenCalled();

      await userEvent.click(screen.getByText("bar"));
      await userEvent.type(input, "{enter}");
      expect(setValue).toHaveBeenCalledWith(["bar"]);
    });

    it("should let you submit empty values when the parameter is not required", async () => {
      const { setValue } = setup({
        parameter: createMockUiParameter({
          values_query_type: "list",
          values_source_type: "static-list",
          values_source_config: {
            values: [["foo"]],
          },
        }),
        parameterValues: createMockParameterValues({
          values: [["foo"]],
        }),
      });

      const input = await screen.findByPlaceholderText("Search the list");
      await userEvent.type(input, "{enter}");
      expect(setValue).toHaveBeenCalledWith([]);
    });

    it("should not let you submit empty values when the parameter is required", async () => {
      const { setValue } = setup({
        parameter: createMockUiParameter({
          required: true,
          values_query_type: "list",
          values_source_type: "static-list",
          values_source_config: {
            values: [["foo"]],
          },
        }),
        parameterValues: createMockParameterValues({
          values: [["foo"]],
        }),
      });

      const input = await screen.findByPlaceholderText("Search the list");
      await userEvent.type(input, "{enter}");
      expect(setValue).not.toHaveBeenCalled();
    });
  });

  describe("search mode", () => {
    it("should submit a value on enter in single-value mode", async () => {
      const { setValue } = setup({
        parameter: createMockUiParameter({
          values_query_type: "search",
          values_source_type: "static-list",
          values_source_config: {
            values: [["foo"]],
          },
          hasVariableTemplateTagTarget: true,
        }),
        parameterSearchValues: {
          f: createMockParameterValues({
            values: [["foo"]],
          }),
        },
      });
      const input = screen.getByRole("textbox");
      await userEvent.type(input, "f");
      expect(input).toHaveValue("f");
      expect(await screen.findByText("foo")).toBeInTheDocument();

      await userEvent.type(input, "{enter}");
      expect(input).toHaveValue("foo");
      expect(setValue).not.toHaveBeenCalled();

      await userEvent.type(input, "{enter}");
      expect(setValue).toHaveBeenCalledWith(["foo"]);
    });

    it("should submit a value on enter in multi-value mode", async () => {
      const { setValue } = setup();
      const input = screen.getByRole("combobox");
      await userEvent.type(input, "foo{enter}");
      expect(screen.getByText("foo")).toBeInTheDocument();
      expect(setValue).not.toHaveBeenCalled();

      await userEvent.type(input, "{enter}");
      expect(setValue).toHaveBeenCalledWith(["foo"]);
    });

    it("should let you submit an empty value on enter if the parameter is not required", async () => {
      const { setValue } = setup();

      const input = screen.getByRole("combobox");
      await userEvent.type(input, "foo{enter}");
      expect(screen.getByText("foo")).toBeInTheDocument();
      expect(setValue).not.toHaveBeenCalled();

      await userEvent.type(input, "{backspace}{enter}");
      expect(setValue).toHaveBeenCalledWith([]);
    });

    it("should not let you submit an empty value on enter if the parameter is required", async () => {
      const { setValue } = setup({
        parameter: createMockUiParameter({
          required: true,
        }),
      });

      const input = screen.getByRole("combobox");
      await userEvent.type(input, "foo{enter}");
      expect(screen.getByText("foo")).toBeInTheDocument();
      expect(setValue).not.toHaveBeenCalled();

      await userEvent.type(input, "{backspace}{enter}");
      expect(setValue).not.toHaveBeenCalled();
    });
  });
});
