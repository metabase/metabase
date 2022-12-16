import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockUiParameter } from "metabase-lib/mocks";
import ParameterSidebar, { ParameterSidebarProps } from "./ParameterSidebar";

describe("ParameterSidebar", () => {
  it("should rename the parameter", () => {
    const props = getProps({
      parameter: createMockUiParameter({
        id: "1",
        name: "Old name",
      }),
    });

    render(<ParameterSidebar {...props} />);

    const input = screen.getByDisplayValue("Old name");
    userEvent.clear(input);
    userEvent.type(input, "New name");
    userEvent.tab();

    expect(props.onChangeName).toHaveBeenCalledWith("1", "New name");
  });
});

const getProps = (
  opts?: Partial<ParameterSidebarProps>,
): ParameterSidebarProps => ({
  parameter: createMockUiParameter(),
  otherParameters: [],
  onChangeName: jest.fn(),
  onChangeDefaultValue: jest.fn(),
  onChangeIsMultiSelect: jest.fn(),
  onChangeSourceType: jest.fn(),
  onChangeSourceOptions: jest.fn(),
  onChangeFilteringParameters: jest.fn(),
  onRemoveParameter: jest.fn(),
  onShowAddParameterPopover: jest.fn(),
  onClose: jest.fn(),
  ...opts,
});
