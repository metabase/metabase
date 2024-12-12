import { render, screen } from "@testing-library/react";

import ValueComponent from "metabase/components/Value";

import SingleSelectListField from ".";

const value = [];
const firstOption = "AK";
const secondOption = "AL";
const options = [[firstOption], [secondOption]];
const fields = [];
const formatOptions = {};

function showRemapping(fields) {
  return fields.length === 1;
}

function renderValue(fields, formatOptions, value, options) {
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
      optionRenderer={option => renderValue(fields, formatOptions, option[0])}
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
});
