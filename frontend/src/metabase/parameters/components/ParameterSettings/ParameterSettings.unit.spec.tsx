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
    // expect there to be an error message with the text "Required"
    expect(screen.getByText(/required/i)).toBeInTheDocument();
    labelInput.blur();
    // when the input blurs, the value should have reverted to the original
    expect(onChangeName).not.toHaveBeenCalled();
    expect(labelInput).toHaveValue("foo");
    // the error message should disappear
    expect(screen.queryByText(/required/i)).not.toBeInTheDocument();

    // sanity check with a non-blank value
    fillValue(labelInput, "bar");
    labelInput.blur();
    expect(onChangeName).toHaveBeenCalledWith("bar");
    expect(labelInput).toHaveValue("bar");
  });

  it("should not update the label if the slug is duplicated with another parameter", () => {
    const { onChangeName } = setup({
      parameter: createMockUiParameter({
        name: "foo",
        type: "string/=",
        sectionId: "string",
      }),
    });
    const labelInput = screen.getByLabelText("Label");
    fillValue(labelInput, "Baz");
    // expect there to be an error message with the text "This label is alreay in use"
    const error = /this label is already in use/i;
    expect(screen.getByText(error)).toBeInTheDocument();
    labelInput.blur();
    // when the input blurs, the value should have reverted to the original
    expect(onChangeName).not.toHaveBeenCalled();
    expect(labelInput).toHaveValue("foo");
    // the error message should disappear
    expect(screen.queryByText(error)).not.toBeInTheDocument();

    // sanity check with another value
    fillValue(labelInput, "bar");
    labelInput.blur();
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
      otherParameterSlugs={["baz"]}
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
