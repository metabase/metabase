import { waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import type { OptionsType } from "metabase/lib/formatting";
import type Field from "metabase-lib/v1/metadata/Field";
import type { FieldValue, RowValue } from "metabase-types/api";

import { Value as ValueComponent } from "../../Value";

import SingleSelectListField from "./index";

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
  formatOptions: Partial<OptionsType>,
  value: unknown,
) {
  return (
    <ValueComponent
      value={value}
      column={fields[0]}
      maximumFractionDigits={20}
      remap={showRemapping(fields)}
      {...formatOptions}
      {...options}
    />
  );
}

function setup(opts = {}) {
  const onChange = jest.fn();
  const onSearchChange = jest.fn();

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
  it("displays search input", () => {
    setup();

    expect(screen.getByPlaceholderText("Find...")).toBeInTheDocument();
  });

  it("displays options", () => {
    setup({ alwaysShowOptions: true });

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
    await waitForElementToBeRemoved(() => screen.queryByText("true"));
    expect(screen.getAllByText("false")).toHaveLength(1);
  });

  it("should not create duplicate options on pressing Enter for non-string values", async () => {
    setup({ value: [], options: [[true], [false]] });
    const input = screen.getByPlaceholderText("Find...");
    await userEvent.type(input, "false{enter}");
    expect(screen.getAllByText("true")).toHaveLength(1);
    expect(screen.getAllByText("false")).toHaveLength(1);
  });
});
