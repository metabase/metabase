import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { act, renderWithProviders, screen } from "__support__/ui";
import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import type { UiParameter } from "metabase-lib/v1/parameters/types";

import { ParameterSidebar } from "./ParameterSidebar";

interface SetupOpts {
  initialParameter: UiParameter;
  nextParameter?: UiParameter;
  otherParameters: UiParameter[];
  hasMapping?: boolean;
}

const setup = ({
  initialParameter,
  nextParameter,
  otherParameters,
  hasMapping,
}: SetupOpts): {
  clickNextParameterButton: () => Promise<void>;
} => {
  const NEXT_PARAMETER_BUTTON_ID = "parameter-sidebar-test-change";

  const TestWrapper = ({
    initialParameter,
    nextParameter,
    otherParameters,
    hasMapping = false,
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
          onChangeType={jest.fn()}
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
          hasMapping={hasMapping}
        />
      </div>
    );
  };

  renderWithProviders(
    <TestWrapper
      initialParameter={initialParameter}
      nextParameter={nextParameter}
      otherParameters={otherParameters}
      hasMapping={hasMapping}
    />,
  );

  return {
    clickNextParameterButton: () =>
      userEvent.click(screen.getByTestId(NEXT_PARAMETER_BUTTON_ID)),
  };
};

async function fillValue(input: HTMLElement, value: string) {
  await userEvent.clear(input);
  await userEvent.type(input, value);
}

describe("ParameterSidebar", () => {
  it("should not update the label if the slug is duplicated with another parameter", async () => {
    setup({
      initialParameter: createMockUiParameter({
        id: "id2",
        name: "Foo",
        slug: "foo",
        sectionId: "string",
      }),
      otherParameters: [
        createMockUiParameter({
          id: "id1",
          name: "Baz",
          slug: "baz",
          sectionId: "string",
        }),
      ],
    });

    await userEvent.click(screen.getByRole("tab", { name: "Filter settings" }));
    const labelInput = screen.getByLabelText("Label");
    await fillValue(labelInput, "Baz");
    // expect there to be an error message with the text "This label is already in use"
    const error = /this label is already in use/i;
    expect(screen.getByText(error)).toBeInTheDocument();
    act(() => {
      labelInput.blur();
    });
    // when the input blurs, the value should have reverted to the original
    expect(labelInput).toHaveValue("Foo");
    // the error message should disappear
    expect(screen.queryByText(error)).not.toBeInTheDocument();

    // sanity check with another value
    await fillValue(labelInput, "Bar");
    act(() => {
      labelInput.blur();
    });
    expect(labelInput).toHaveValue("Bar");
  });

  it("if the parameter updates, the label should update (metabase#34611)", async () => {
    const initialParameter = createMockUiParameter({
      id: "id1",
      name: "Foo",
      slug: "foo",
      sectionId: "string",
    });
    const nextParameter = createMockUiParameter({
      id: "id1",
      name: "Bar",
      slug: "Bar",
      sectionId: "string",
    });
    const { clickNextParameterButton } = setup({
      initialParameter,
      nextParameter,
      otherParameters: [],
    });

    const labelInput = screen.getByLabelText("Label");
    expect(labelInput).toHaveValue("Foo");
    await clickNextParameterButton();
    expect(labelInput).toHaveValue("Bar");
  });

  describe("when parameter can't use link filters", () => {
    it("resets tab to 'Filter settings' on parameter change", async () => {
      const initialParameter = createMockUiParameter({
        id: "id1",
        name: "Foo",
        slug: "foo",
        sectionId: "string",
      });
      const nextParameter = createMockUiParameter({
        id: "id2",
        name: "Bar",
        slug: "Bar",
        type: "date/single",
        sectionId: "date",
      });

      const { clickNextParameterButton } = setup({
        initialParameter,
        nextParameter,
        otherParameters: [],
      });

      // switch tab
      await userEvent.click(
        screen.getByRole("tab", { name: "Linked filters" }),
      );

      await clickNextParameterButton();

      // verify Linked filters tab is not rendered
      expect(
        screen.queryByRole("tab", { name: "Linked filters" }),
      ).not.toBeInTheDocument();

      // verify tab content corresponds to Filter settings
      expect(
        screen.queryByText("Limit this filter's choices"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("textbox", {
          name: "Label",
        }),
      ).toHaveValue("Bar");
    });
  });

  describe("disconnect from cards", () => {
    it("renders button when there is mapping", () => {
      const initialParameter = createMockUiParameter({
        id: "id1",
        name: "Foo",
        slug: "foo",
        sectionId: "string",
      });

      setup({
        initialParameter,
        otherParameters: [],
        hasMapping: true,
      });

      expect(screen.getByText("Disconnect from cards")).toBeInTheDocument();
    });

    it("doesn't render button when there is no mapping", () => {
      const initialParameter = createMockUiParameter({
        id: "id1",
        name: "Foo",
        slug: "foo",
        sectionId: "string",
      });

      setup({
        initialParameter,
        otherParameters: [],
        hasMapping: false,
      });

      expect(
        screen.queryByText("Disconnect from cards"),
      ).not.toBeInTheDocument();
    });
  });
});
