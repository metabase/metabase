import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { ParameterValueOrArray } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";
import { createProductsRatingField } from "metabase-types/api/mocks/presets";

import { ParameterValueWidget } from "./ParameterValueWidget";

interface SetupOpts {
  parameter?: Partial<UiParameter>;
  value?: ParameterValueOrArray | null;
}

function setup({ parameter, value = null }: SetupOpts = {}) {
  const defaultParameter: UiParameter = {
    ...createMockParameter({
      id: "test-param",
      type: "string/=",
      slug: "text",
      name: "Text",
    }),
    fields: [],
    ...parameter,
  };

  const setValue = jest.fn();

  renderWithProviders(
    <ParameterValueWidget
      parameter={defaultParameter}
      setValue={setValue}
      value={value}
      placeholder="Enter a value"
    />,
  );

  return { setValue };
}

describe("ParameterValueWidget", () => {
  it("should let a number filter be typed into when its field has no values to list", async () => {
    setup({
      parameter: {
        ...createMockParameter({
          id: "number-param",
          type: "number/=",
          sectionId: "number",
          slug: "number",
          name: "Number Equals",
        }),
        fields: [createProductsRatingField({ has_field_values: "none" })],
      },
    });

    await userEvent.click(screen.getByTestId("parameter-value-widget-target"));

    expect(
      await screen.findByPlaceholderText("Enter a number"),
    ).toBeInTheDocument();
  });

  it("should apply aria-expanded=true on the trigger button element (#70543)", async () => {
    setup();

    const triggerButton = screen.getByTestId("parameter-value-widget-target");

    // The trigger should be a button element (rendered via UnstyledButton when hasPopover is true)
    expect(triggerButton.tagName).toBe("BUTTON");

    // Before opening, aria-expanded should be false
    expect(triggerButton).toHaveAttribute("aria-expanded", "false");

    // Open the popover
    await userEvent.click(triggerButton);

    // After opening, aria-expanded should be true on the same button
    expect(triggerButton).toHaveAttribute("aria-expanded", "true");
  });

  describe("required parameter with a default value", () => {
    const parameter = createMockParameter({
      id: "state",
      type: "string/=",
      slug: "state",
      name: "State",
      required: true,
      default: "CA",
    });

    it.each([
      { value: "CA", description: "the default value" },
      { value: ["CA"], description: "the default value wrapped in an array" },
    ])(
      "should not offer to revert to the default value when the value is $description (metabase#38083)",
      ({ value }) => {
        setup({ parameter, value });

        expect(screen.getByText("CA")).toBeInTheDocument();
        expect(screen.queryByLabelText("revert icon")).not.toBeInTheDocument();
      },
    );

    it("should offer to revert to the default value when the value differs from it", () => {
      setup({ parameter, value: ["NY"] });

      expect(screen.getByLabelText("revert icon")).toBeInTheDocument();
    });
  });
});
