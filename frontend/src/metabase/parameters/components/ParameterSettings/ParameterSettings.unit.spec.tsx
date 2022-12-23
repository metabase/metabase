import React from "react";
import { render, screen } from "@testing-library/react";
import { createMockUiParameter } from "metabase-lib/mocks";
import ParameterSettings, { ParameterSettingsProps } from "./ParameterSettings";

describe("ParameterSettings", () => {
  it("should show source settings only for string dropdowns", () => {
    const props = getProps({
      parameter: createMockUiParameter({
        type: "string/=",
      }),
    });

    render(<ParameterSettings {...props} />);

    expect(screen.getByText("Options to pick from")).toBeInTheDocument();
  });

  it("should not show source settings for other parameter types", () => {
    const props = getProps({
      parameter: createMockUiParameter({
        type: "string/!=",
      }),
    });

    render(<ParameterSettings {...props} />);

    expect(screen.queryByText("Options to pick from")).not.toBeInTheDocument();
  });
});

const getProps = (
  opts?: Partial<ParameterSettingsProps>,
): ParameterSettingsProps => ({
  parameter: createMockUiParameter(),
  onChangeName: jest.fn(),
  onChangeDefaultValue: jest.fn(),
  onChangeIsMultiSelect: jest.fn(),
  onChangeSourceType: jest.fn(),
  onChangeSourceConfig: jest.fn(),
  onRemoveParameter: jest.fn(),
  ...opts,
});
