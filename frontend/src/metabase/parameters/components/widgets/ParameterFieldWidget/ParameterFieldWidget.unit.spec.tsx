import userEvent from "@testing-library/user-event";

import {
  setupParameterSearchValuesEndpoint,
  setupParameterValuesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  ParameterField,
  ParameterValue,
  ParameterValues,
} from "metabase-types/api";
import {
  createMockParameterField,
  createMockParameterValues,
} from "metabase-types/api/mocks";

import { ParameterFieldWidget } from "./ParameterFieldWidget";

const FIELD_ID = 100;

type SetupOpts = {
  parameter?: UiParameter;
  parameterValues?: ParameterValues;
  parameterSearchValues?: Record<string, ParameterValues>;
  fieldSettings?: Partial<ParameterField>;
};

function setup({
  parameter = createMockUiParameter(),
  parameterValues = createMockParameterValues(),
  parameterSearchValues = {},
  fieldSettings,
}: SetupOpts = {}) {
  setupParameterValuesEndpoints(parameterValues);
  Object.entries(parameterSearchValues).forEach(([query, values]) => {
    setupParameterSearchValuesEndpoint(query, values);
  });

  const field = createMockParameterField({
    id: FIELD_ID,
    ...fieldSettings,
  });
  const setValue = jest.fn();
  renderWithProviders(
    <ParameterFieldWidget
      parameter={parameter}
      fields={[field]}
      setValue={setValue}
    />,
  );

  return { setValue };
}

describe("ParameterFieldWidget", () => {
  describe("list mode, single value", () => {
    const parameter = createMockUiParameter({
      values_query_type: "list",
      values_source_type: "static-list",
      values_source_config: {
        values: [["foo"]],
      },
      hasVariableTemplateTagTarget: true,
    });
    const parameterValues = createMockParameterValues({
      values: [["foo"]],
    });

    it("should submit a value on enter", async () => {
      const { setValue } = setup({
        parameter: parameter,
        parameterValues,
      });

      const input = await screen.findByPlaceholderText("Search the list");
      await userEvent.type(input, "bar{enter}");
      expect(screen.getByText("bar")).toBeInTheDocument();
      expect(setValue).not.toHaveBeenCalled();

      await userEvent.click(screen.getByText("bar"));
      await userEvent.type(input, "{enter}");
      expect(setValue).toHaveBeenCalledWith(["bar"]);
    });

    it("should allow to submit empty values when the parameter is not required", async () => {
      const { setValue } = setup({
        parameter,
        parameterValues,
      });

      const input = await screen.findByPlaceholderText("Search the list");
      await userEvent.type(input, "{enter}");
      expect(setValue).toHaveBeenCalledWith([]);
    });

    it("should show all values of a dropdown list (metabase#49577)", async () => {
      const values: ParameterValue[] = [["foo"], ["bar"], ["baz"]];
      setup({
        parameter: {
          ...parameter,
          values_source_config: { values },
        },
        parameterValues: createMockParameterValues({ values }),
      });

      expect(
        await screen.findByPlaceholderText("Search the list"),
      ).toBeInTheDocument();
      expect(await screen.findByTestId("foo-filter-value")).toBeVisible();
      expect(screen.getByTestId("bar-filter-value")).toBeVisible();
      expect(screen.getByTestId("baz-filter-value")).toBeVisible();
    });

    it("should not allow to submit empty values when the parameter required", async () => {
      const { setValue } = setup({
        parameter: {
          ...parameter,
          required: true,
        },
        parameterValues,
      });

      const input = await screen.findByPlaceholderText("Search the list");
      await userEvent.type(input, "{enter}");
      expect(setValue).not.toHaveBeenCalled();
    });
  });

  describe("list mode, multiple values", () => {
    const parameter = createMockUiParameter({
      values_query_type: "list",
      values_source_type: "static-list",
      values_source_config: {
        values: [["foo"]],
      },
    });
    const parameterValues = createMockParameterValues({
      values: [["foo"]],
    });

    it("should submit a value on enter", async () => {
      const { setValue } = setup({
        parameter,
        parameterValues,
      });

      const input = await screen.findByPlaceholderText("Search the list");
      await userEvent.type(input, "bar{enter}");
      expect(screen.getByText("bar")).toBeInTheDocument();
      expect(setValue).not.toHaveBeenCalled();

      await userEvent.click(screen.getByText("bar"));
      await userEvent.type(input, "{enter}");
      expect(setValue).toHaveBeenCalledWith(["bar"]);
    });

    it("should allow to submit empty values when the parameter is not required", async () => {
      const { setValue } = setup({
        parameter,
        parameterValues,
      });

      const input = await screen.findByPlaceholderText("Search the list");
      await userEvent.type(input, "{enter}");
      expect(setValue).toHaveBeenCalledWith([]);
    });

    it("should not allow to submit empty values when the parameter is required", async () => {
      const { setValue } = setup({
        parameter: {
          ...parameter,
          required: true,
        },
        parameterValues,
      });

      const input = await screen.findByPlaceholderText("Search the list");
      await userEvent.type(input, "{enter}");
      expect(setValue).not.toHaveBeenCalled();
    });
  });

  describe("search mode, single value", () => {
    const parameter = createMockUiParameter({
      values_query_type: "search",
      values_source_type: "static-list",
      values_source_config: {
        values: [["foo"]],
      },
      isMultiSelect: false,
      hasVariableTemplateTagTarget: true,
    });

    const parameterSearchValues = {
      f: createMockParameterValues({
        values: [["foo"]],
      }),
    };

    it("should submit a value on enter", async () => {
      const { setValue } = setup({
        parameter,
        parameterSearchValues,
      });
      const input = screen.getByRole("textbox");
      await userEvent.type(input, "f");
      expect(input).toHaveValue("f");
      expect(await screen.findByText("foo")).toBeInTheDocument();

      await userEvent.type(input, "{enter}", { skipClick: true });
      expect(input).toHaveValue("foo");
      expect(setValue).not.toHaveBeenCalled();

      await userEvent.type(input, "{enter}", { skipClick: true });
      expect(setValue).toHaveBeenCalledWith(["foo"]);
    });

    it("should not show the values before a search term is typed (metabase#49577)", async () => {
      setup({
        parameter,
        parameterValues: createMockParameterValues({
          values: [["foo"], ["bar"]],
        }),
        parameterSearchValues,
      });

      const input = screen.getByRole("textbox");
      await userEvent.click(input);
      expect(screen.queryByText("foo")).not.toBeInTheDocument();
      expect(screen.queryByText("bar")).not.toBeInTheDocument();

      await userEvent.type(input, "f");
      expect(await screen.findByText("foo")).toBeInTheDocument();
    });

    it("should allow to submit an empty value on enter when the parameter is not required", async () => {
      const { setValue } = setup({
        parameter,
        parameterSearchValues,
      });

      const input = screen.getByRole("textbox");
      await userEvent.type(input, "{enter}");
      expect(setValue).toHaveBeenCalledWith([]);
    });

    it("should not allow to submit an empty value on enter when the parameter is required", async () => {
      const { setValue } = setup({
        parameter: {
          ...parameter,
          required: true,
        },
        parameterSearchValues,
      });

      const input = screen.getByRole("textbox");
      await userEvent.type(input, "{enter}");
      expect(setValue).not.toHaveBeenCalled();
    });
  });

  describe("search mode, multiple values", () => {
    it("should submit a value on enter", async () => {
      const { setValue } = setup();
      const input = screen.getByRole("combobox");
      await userEvent.type(input, "foo{enter}");
      expect(screen.getByText("foo")).toBeInTheDocument();
      expect(setValue).not.toHaveBeenCalled();

      await userEvent.type(input, "{enter}");
      expect(setValue).toHaveBeenCalledWith(["foo"]);
    });

    it("should allow to submit an empty value on enter if the parameter is not required", async () => {
      const { setValue } = setup();

      const input = screen.getByRole("combobox");
      await userEvent.type(input, "foo{enter}");
      expect(screen.getByText("foo")).toBeInTheDocument();
      expect(setValue).not.toHaveBeenCalled();

      await userEvent.type(input, "{backspace}{enter}");
      expect(setValue).toHaveBeenCalledWith([]);
    });

    it("should not allow to submit an empty value on enter if the parameter is required", async () => {
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

  describe("field formatting", () => {
    const numericFieldParameter = createMockUiParameter({
      values_query_type: "list",
      values_source_type: "static-list",
      values_source_config: {
        values: [[1000], [2000], [3000]],
      },
    });

    const numericFieldValues = createMockParameterValues({
      values: [[1000], [2000], [3000]],
    });

    const numericFieldSettings = {
      display_name: "Amount",
      base_type: "type/BigInteger",
      effective_type: "type/BigInteger",
      has_field_values: "list",
    } satisfies Partial<ParameterField>;

    it("should format numbers with default separators when no custom settings", async () => {
      setup({
        parameter: numericFieldParameter,
        parameterValues: numericFieldValues,
        fieldSettings: numericFieldSettings,
      });

      // need to wait for the settings to load
      expect(await screen.findByText("1,000")).toBeInTheDocument();
      expect(screen.getByText("2,000")).toBeInTheDocument();
      expect(screen.getByText("3,000")).toBeInTheDocument();
    });

    it("should apply custom field formatting settings", async () => {
      setup({
        parameter: numericFieldParameter,
        parameterValues: numericFieldValues,
        fieldSettings: {
          ...numericFieldSettings,
          settings: { number_separators: "." },
        },
      });

      // need to wait for the settings to load
      expect(await screen.findByText("1000")).toBeInTheDocument();
      expect(screen.getByText("2000")).toBeInTheDocument();
      expect(screen.getByText("3000")).toBeInTheDocument();

      expect(screen.queryByText("1,000")).not.toBeInTheDocument();
    });
  });
});
