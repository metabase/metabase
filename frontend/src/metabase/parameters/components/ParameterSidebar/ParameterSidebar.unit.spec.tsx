import userEvent from "@testing-library/user-event";
import React from "react";
import { act, renderWithProviders, screen } from "__support__/ui";
import type { UiParameter } from "metabase-lib/parameters/types";
import { createMockUiParameter } from "metabase-lib/parameters/mock";
import ParameterSidebar from "./ParameterSidebar";

interface SetupOpts {
  initialParameter: UiParameter;
  otherParameters: UiParameter[];
}

const setup = ({
  initialParameter,
  otherParameters,
}: SetupOpts): {
  setParameter: (parameter: UiParameter) => void;
} => {
  let setParameter: (parameter: UiParameter) => void;

  const TestWrapper = () => {
    const [parameter, internalSetParameter] = React.useState(initialParameter);
    setParameter = internalSetParameter;

    const onChangeName = (_parameterId: string, name: string) => {
      setParameter({ ...initialParameter, name });
    };

    return (
      <ParameterSidebar
        parameter={parameter}
        otherParameters={otherParameters}
        onChangeName={onChangeName}
        onChangeDefaultValue={jest.fn()}
        onChangeIsMultiSelect={jest.fn()}
        onChangeQueryType={jest.fn()}
        onChangeSourceType={jest.fn()}
        onChangeSourceConfig={jest.fn()}
        onChangeFilteringParameters={jest.fn()}
        onRemoveParameter={jest.fn()}
        onShowAddParameterPopover={jest.fn()}
        onClose={jest.fn()}
      />
    );
  };

  renderWithProviders(<TestWrapper />);

  return { setParameter };
};

function fillValue(input: HTMLElement, value: string) {
  userEvent.clear(input);
  userEvent.type(input, value);
}

describe("ParameterSidebar", () => {
  it("should not update the label if the slug is duplicated with another parameter", () => {
    setup({
      initialParameter: createMockUiParameter({
        id: "id2",
        name: "Foo",
        slug: "foo",
      }),
      otherParameters: [
        createMockUiParameter({
          id: "id1",
          name: "Baz",
          slug: "baz",
        }),
      ],
    });

    userEvent.click(screen.getByRole("radio", { name: "Settings" }));
    const labelInput = screen.getByLabelText("Label");
    fillValue(labelInput, "Baz");
    // expect there to be an error message with the text "This label is already in use"
    const error = /this label is already in use/i;
    expect(screen.getByText(error)).toBeInTheDocument();
    labelInput.blur();
    // when the input blurs, the value should have reverted to the original
    expect(labelInput).toHaveValue("Foo");
    // the error message should disappear
    expect(screen.queryByText(error)).not.toBeInTheDocument();

    // sanity check with another value
    fillValue(labelInput, "Bar");
    labelInput.blur();
    expect(labelInput).toHaveValue("Bar");
  });

  it("if the parameter updates, the label should update (metabase#34611)", () => {
    const initialParameter = createMockUiParameter({
      id: "id1",
      name: "Foo",
      slug: "foo",
    });
    const otherParameter = createMockUiParameter({
      id: "id1",
      name: "Baz",
      slug: "baz",
    });
    const { setParameter } = setup({
      initialParameter,
      otherParameters: [otherParameter],
    });

    const labelInput = screen.getByLabelText("Label");
    expect(labelInput).toHaveValue("Foo");

    act(() => {
      setParameter(otherParameter);
    });
    expect(labelInput).toHaveValue("Baz");
  });
});
