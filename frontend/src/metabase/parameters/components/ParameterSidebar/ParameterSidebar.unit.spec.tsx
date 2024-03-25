import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import type { UiParameter } from "metabase-lib/v1/parameters/types";

import { ParameterSidebar } from "./ParameterSidebar";

interface SetupOpts {
  initialParameter: UiParameter;
  nextParameter?: UiParameter;
  otherParameters: UiParameter[];
}

const setup = ({
  initialParameter,
  nextParameter,
  otherParameters,
}: SetupOpts): {
  clickNextParameterButton: () => void;
} => {
  const NEXT_PARAMETER_BUTTON_ID = "parameter-sidebar-test-change";

  const TestWrapper = ({
    initialParameter,
    nextParameter,
    otherParameters,
  }: SetupOpts) => {
    const [parameter, setParameter] = useState(initialParameter);

    const onChangeName = (_parameterId: string, name: string) => {
      setParameter({ ...initialParameter, name });
    };

    return (
      <div>
        <button
          data-testid={NEXT_PARAMETER_BUTTON_ID}
          onClick={() => nextParameter && setParameter(nextParameter)}
        >
          Next Parameter Button
        </button>
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
          onChangeRequired={jest.fn()}
          getEmbeddedParameterVisibility={() => null}
        />
      </div>
    );
  };

  renderWithProviders(
    <TestWrapper
      initialParameter={initialParameter}
      nextParameter={nextParameter}
      otherParameters={otherParameters}
    />,
  );

  return {
    clickNextParameterButton: () =>
      userEvent.click(screen.getByTestId(NEXT_PARAMETER_BUTTON_ID)),
  };
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
    const nextParameter = createMockUiParameter({
      id: "id1",
      name: "Bar",
      slug: "Bar",
    });
    const { clickNextParameterButton } = setup({
      initialParameter,
      nextParameter,
      otherParameters: [],
    });

    const labelInput = screen.getByLabelText("Label");
    expect(labelInput).toHaveValue("Foo");
    clickNextParameterButton();
    expect(labelInput).toHaveValue("Bar");
  });
});
