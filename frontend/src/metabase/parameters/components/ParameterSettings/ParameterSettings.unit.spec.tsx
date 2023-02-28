import React from "react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import { UiParameter } from "metabase-lib/parameters/types";
import { createMockUiParameter } from "metabase-lib/parameters/mock";
import ParameterSettings from "../ParameterSettings";

interface SetupOpts {
  parameter?: UiParameter;
}

describe("ParameterSidebar", () => {
  it("should allow to change source settings for string parameters", () => {
    const { onChangeQueryType } = setup({
      parameter: createMockUiParameter({
        type: "string/=",
        sectionId: "string",
      }),
    });

    userEvent.click(screen.getByRole("radio", { name: "Search box" }));

    expect(onChangeQueryType).toHaveBeenCalledWith("search");
  });

  it("should allow to change source settings for location parameters", () => {
    const { onChangeQueryType } = setup({
      parameter: createMockUiParameter({
        type: "string/=",
        sectionId: "location",
      }),
    });

    userEvent.click(screen.getByRole("radio", { name: "Input box" }));

    expect(onChangeQueryType).toHaveBeenCalledWith("none");
  });
});

const setup = ({ parameter = createMockUiParameter() }: SetupOpts = {}) => {
  const onChangeQueryType = jest.fn();

  renderWithProviders(
    <ParameterSettings
      parameter={parameter}
      onChangeName={jest.fn()}
      onChangeDefaultValue={jest.fn()}
      onChangeIsMultiSelect={jest.fn()}
      onChangeQueryType={onChangeQueryType}
      onChangeSourceType={jest.fn()}
      onChangeSourceConfig={jest.fn()}
      onRemoveParameter={jest.fn()}
    />,
  );

  return { onChangeQueryType };
};
