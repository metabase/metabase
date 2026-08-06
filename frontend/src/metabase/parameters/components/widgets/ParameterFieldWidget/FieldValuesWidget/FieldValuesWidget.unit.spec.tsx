import userEvent from "@testing-library/user-event";

import { setupParameterValuesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockParameter,
  createMockParameterValues,
} from "metabase-types/api/mocks";

import {
  FieldValuesWidget,
  type IFieldValuesWidgetProps,
} from "./FieldValuesWidget";
import { state } from "./testMocks.spec";

const setup = (props: Partial<IFieldValuesWidgetProps> = {}) => {
  const onChange = jest.fn();
  renderWithProviders(
    <FieldValuesWidget
      value={[]}
      fields={[]}
      onChange={onChange}
      parameter={createMockParameter({ values_query_type: "none" })}
      {...props}
    />,
    { storeInitialState: state },
  );
  return { onChange };
};

describe("FieldValuesWidget", () => {
  describe("placeholder", () => {
    it("should prompt for text for a string parameter with no values", () => {
      setup({ parameter: createMockParameter({ values_query_type: "none" }) });
      expect(
        screen.getByPlaceholderText("Enter some text"),
      ).toBeInTheDocument();
    });

    it("should prompt for an ID for an id parameter with no values", () => {
      setup({
        parameter: createMockParameter({
          type: "id/=",
          values_query_type: "none",
        }),
      });
      expect(screen.getByPlaceholderText("Enter an ID")).toBeInTheDocument();
    });

    it("should prompt for a number for a number parameter with no values", () => {
      setup({
        parameter: createMockParameter({
          type: "number/=",
          values_query_type: "none",
        }),
      });
      expect(screen.getByPlaceholderText("Enter a number")).toBeInTheDocument();
    });
  });

  describe("multi-select", () => {
    it("should commit a typed value on enter", async () => {
      const { onChange } = setup({ multi: true, placeholder: "Value" });

      await userEvent.type(await screen.findByRole("combobox"), "foo{enter}");

      expect(onChange).toHaveBeenLastCalledWith(["foo"]);
    });

    it("should parse typed values for a numeric parameter", async () => {
      const { onChange } = setup({
        multi: true,
        placeholder: "Value",
        parameter: createMockParameter({
          type: "number/=",
          values_query_type: "none",
        }),
      });

      await userEvent.type(await screen.findByRole("combobox"), "42{enter}");

      expect(onChange).toHaveBeenLastCalledWith([42]);
    });
  });

  describe("single-select", () => {
    it("should commit a typed freeform value", async () => {
      const { onChange } = setup({ placeholder: "Value" });

      await userEvent.type(screen.getByPlaceholderText("Value"), "abc");

      expect(onChange).toHaveBeenLastCalledWith(["abc"]);
    });

    it("should parse a typed freeform value for a numeric parameter", async () => {
      const { onChange } = setup({
        placeholder: "Value",
        parameter: createMockParameter({
          type: "number/=",
          values_query_type: "none",
        }),
      });

      await userEvent.type(screen.getByPlaceholderText("Value"), "42");

      expect(onChange).toHaveBeenLastCalledWith([42]);
    });

    it("should accept the top matching option when pressing enter", async () => {
      setupParameterValuesEndpoints(
        createMockParameterValues({ values: [["Gadget"], ["Gizmo"]] }),
      );
      const { onChange } = setup({
        placeholder: "Value",
        disableList: true,
        parameter: createMockParameter({
          values_source_type: "static-list",
          values_source_config: { values: [["Gadget"], ["Gizmo"]] },
          values_query_type: "list",
        }),
      });

      const input = screen.getByPlaceholderText("Value");
      await userEvent.click(input);
      expect(await screen.findByText("Gadget")).toBeInTheDocument();
      await userEvent.type(input, "Ga");
      await userEvent.keyboard("{enter}");

      expect(onChange).toHaveBeenLastCalledWith(["Gadget"]);
    });
  });

  describe("remapped values (value ≠ label)", () => {
    const REMAPPED_VALUES: [string | number, string][] = [
      [1, "Gadget"],
      [2, "Gizmo"],
    ];

    it("should commit the underlying value, not the label, when clicking a remapped option", async () => {
      setupParameterValuesEndpoints(
        createMockParameterValues({ values: REMAPPED_VALUES }),
      );
      const { onChange } = setup({
        placeholder: "Value",
        disableList: true,
        parameter: createMockParameter({
          values_source_type: "static-list",
          values_source_config: { values: REMAPPED_VALUES },
          values_query_type: "list",
        }),
      });

      const input = screen.getByPlaceholderText("Value");
      await userEvent.click(input);
      await userEvent.click(await screen.findByText("Gadget"));

      // Mantine's Autocomplete commits option.label on submit; the widget must
      // commit the underlying value "1" instead of the display label "Gadget".
      expect(onChange).toHaveBeenLastCalledWith(["1"]);
    });

    it("should not clear a numeric filter when clicking a remapped option", async () => {
      setupParameterValuesEndpoints(
        createMockParameterValues({ values: REMAPPED_VALUES }),
      );
      const { onChange } = setup({
        placeholder: "Value",
        disableList: true,
        parameter: createMockParameter({
          type: "number/=",
          values_source_type: "static-list",
          values_source_config: { values: REMAPPED_VALUES },
          values_query_type: "list",
        }),
      });

      const input = screen.getByPlaceholderText("Value");
      await userEvent.click(input);
      await userEvent.click(await screen.findByText("Gadget"));

      // Committing the label "Gadget" fails numeric parsing and clears the
      // filter (onChange([])); the underlying value 1 must be committed.
      expect(onChange).toHaveBeenLastCalledWith([1]);
    });
  });
});
