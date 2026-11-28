import userEvent from "@testing-library/user-event";

import { fireEvent, render, screen, waitFor } from "__support__/ui";
import { getParameterFieldInfo } from "metabase-lib/v1/parameters/utils/parameter-fields";
import type {
  ColumnSettings,
  Field,
  FieldValue,
  RowValue,
} from "metabase-types/api";

import { Value as ValueComponent } from "../../Value";

import type { SingleSelectListFieldProps } from "./types";

import { SingleSelectListField } from "./index";

const value: RowValue[] = [];
const firstOption = "AK";
const secondOption = "AL";
const options: FieldValue[] = [[firstOption], [secondOption]];
const fields: Field[] = [];
const formatOptions = {};

function showRemapping(fields: Field[]) {
  return fields.length === 1;
}

function renderValue(
  fields: Field[],
  formatOptions: Partial<ColumnSettings>,
  value: unknown,
) {
  return (
    <ValueComponent
      value={value}
      field={fields[0] != null ? getParameterFieldInfo(fields[0]) : undefined}
      maximumFractionDigits={20}
      remap={showRemapping(fields)}
      {...formatOptions}
      {...options}
    />
  );
}

type SetupOpts = Partial<SingleSelectListFieldProps>;

function setup(opts: SetupOpts = {}) {
  const onChange = jest.fn<void, [RowValue[]]>();
  const onSearchChange = jest.fn<void, [string]>();

  render(
    <SingleSelectListField
      onChange={onChange}
      onSearchChange={onSearchChange}
      value={value}
      options={options}
      optionRenderer={(option) => renderValue(fields, formatOptions, option[0])}
      {...opts}
    />,
  );

  return {
    onChange,
    onSearchChange,
  };
}

describe("SingleSelectListField", () => {
  it.each(["{Enter}", " "])(
    "selects a searched result using Tab and %s",
    async (key) => {
      const { onChange } = setup({
        options: [["Donnelly"], ["Wilkinson, Donnelly"], ["Other"]],
      });
      await userEvent.type(screen.getByRole("textbox"), "don");
      await waitFor(() =>
        expect(screen.queryByText("Other")).not.toBeInTheDocument(),
      );
      await userEvent.tab();
      expect(
        screen.getByRole("button", { name: "Clear search" }),
      ).toHaveFocus();
      await userEvent.tab();
      const result = screen.getByRole("button", {
        name: "Donnelly",
      });
      expect(result).toHaveFocus();
      await userEvent.keyboard(key);
      expect(onChange).toHaveBeenLastCalledWith(["Donnelly"]);
      expect(result).toHaveAttribute("aria-pressed", "true");
    },
  );

  it("selects the first matching result when ArrowDown immediately follows typing", async () => {
    const { onChange } = setup({ options: [["Alfa"], ["Beta"]] });
    await userEvent.type(screen.getByRole("textbox"), "be{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["Beta"]);
  });

  it("navigates filtered results with arrows, Home and End and returns to search", async () => {
    const { onChange } = setup({
      options: [["Donnelly"], ["Wilkinson, Donnelly"], ["Other"]],
    });
    const search = screen.getByRole("textbox");
    await userEvent.type(search, "don");
    await waitFor(() =>
      expect(screen.queryByText("Other")).not.toBeInTheDocument(),
    );
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "Donnelly" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(
      screen.getByRole("button", { name: "Wilkinson, Donnelly" }),
    ).toHaveFocus();
    await userEvent.keyboard("{Home}{ArrowUp}");
    expect(search).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["Wilkinson, Donnelly"]);
  });

  it("leaves an empty result search focused and ignores arrows during composition", async () => {
    setup();
    const search = screen.getByRole("textbox");
    fireEvent.keyDown(search, { key: "ArrowDown", isComposing: true });
    expect(search).toHaveFocus();
    await userEvent.type(search, "missing");
    await screen.findByText("Didn't find anything");
    await userEvent.keyboard("{ArrowDown}{ArrowUp}");
    expect(search).toHaveFocus();
  });

  it("displays search input", () => {
    setup();

    expect(screen.getByPlaceholderText("Find...")).toBeInTheDocument();
  });

  it("displays options", () => {
    setup();

    expect(screen.getByText(firstOption)).toBeInTheDocument();
    expect(screen.getByText(secondOption)).toBeInTheDocument();
  });

  it("should not create duplicate options for non-string values", () => {
    setup({ value: [true, false], options: [[true], [false]] });
    expect(screen.getAllByText("true")).toHaveLength(1);
    expect(screen.getAllByText("false")).toHaveLength(1);
  });

  it("should not create duplicate options when searching with non-string values", async () => {
    setup({ value: [], options: [[true], [false]] });
    const input = screen.getByPlaceholderText("Find...");
    await userEvent.type(input, "false");
    expect(screen.queryByText("true")).not.toBeInTheDocument();
    expect(screen.getAllByText("false")).toHaveLength(1);
  });

  it("should not create duplicate options on pressing Enter for non-string values", async () => {
    setup({ value: [], options: [[true], [false]] });
    const input = screen.getByPlaceholderText("Find...");
    await userEvent.type(input, "false{enter}");
    await userEvent.clear(input);
    expect(screen.getAllByText("true")).toHaveLength(1);
    expect(screen.getAllByText("false")).toHaveLength(1);
  });
});
