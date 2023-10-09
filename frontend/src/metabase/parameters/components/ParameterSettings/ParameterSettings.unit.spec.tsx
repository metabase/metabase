import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import type { UiParameter } from "metabase-lib/parameters/types";
import { createMockUiParameter } from "metabase-lib/parameters/mock";
import ParameterSettings from "../ParameterSettings";

interface SetupOpts {
  parameter?: UiParameter;
}

function fillValue(input: HTMLElement, value: string) {
  userEvent.clear(input);
  if (value.length) {
    userEvent.type(input, value);
  }
  input.blur();
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

  it("should not update the label if the input is blank", () => {
    const { onChangeName } = setup({
      parameter: createMockUiParameter({
        name: "foo",
        type: "string/=",
        sectionId: "string",
      }),
    });
    const labelInput = screen.getByLabelText("Label");
    expect(labelInput).toHaveValue("foo");
    fillValue(labelInput, "");
    expect(onChangeName).not.toHaveBeenCalled();
    expect(labelInput).toHaveValue("foo");

    fillValue(labelInput, "bar");
    expect(onChangeName).toHaveBeenCalledWith("bar");
    expect(labelInput).toHaveValue("bar");
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
  const onChangeName = jest.fn();

  renderWithProviders(
    <ParameterSettings
      parameter={parameter}
      onChangeName={onChangeName}
      onChangeDefaultValue={jest.fn()}
      onChangeIsMultiSelect={jest.fn()}
      onChangeQueryType={onChangeQueryType}
      onChangeSourceType={jest.fn()}
      onChangeSourceConfig={jest.fn()}
      onRemoveParameter={jest.fn()}
    />,
  );

  return { onChangeQueryType, onChangeName };
};
