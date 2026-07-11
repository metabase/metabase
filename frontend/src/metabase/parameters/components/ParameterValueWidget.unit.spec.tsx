import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { createMockParameter } from "metabase-types/api/mocks";

import { ParameterValueWidget } from "./ParameterValueWidget";

function setup({
  parameter,
  value = null,
  enableRequiredBehavior,
}: {
  parameter?: Partial<UiParameter>;
  value?: unknown;
  enableRequiredBehavior?: boolean;
} = {}) {
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
      enableRequiredBehavior={enableRequiredBehavior}
    />,
  );

  return { setValue };
}

describe("ParameterValueWidget", () => {
  // metabase#52918: for date parameters the dropdown must drop its `maxWidth`
  // constraint (set to `100vw !important`) so floating-ui can re-measure and
  // re-position the popover when the datepicker changes its width. Otherwise the
  // clamped max-width causes the popover contents to overflow.
  it("should remove the max-width constraint on the dropdown for date parameters (metabase#52918)", async () => {
    setup({
      parameter: { type: "date/all-options", slug: "date", name: "Date" },
    });

    await userEvent.click(screen.getByTestId("parameter-value-widget-target"));

    const dropdown = screen.getByTestId("parameter-value-dropdown");
    expect(dropdown).toHaveStyle("max-width: 100vw !important");
  });

  it("should not remove the max-width constraint on the dropdown for non-date parameters (metabase#52918)", async () => {
    setup({
      parameter: { type: "string/=", slug: "text", name: "Text" },
    });

    await userEvent.click(screen.getByTestId("parameter-value-widget-target"));

    const dropdown = screen.getByTestId("parameter-value-dropdown");
    expect(dropdown).not.toHaveStyle("max-width: 100vw !important");
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
  // metabase#38083: a required parameter's current value can arrive as an array
  // (e.g. `["CA"]` for a `string/=` widget) while its default is stored as a
  // scalar (`"CA"`). The reset-to-default icon must only show when the value
  // actually differs from the default, so the two must be compared as arrays.
  it("should not show the reset-to-default icon when an array value equals the scalar default (metabase#38083)", () => {
    setup({
      parameter: { required: true, default: "CA" },
      value: ["CA"],
      enableRequiredBehavior: true,
    });

    expect(
      screen.queryByLabelText("Reset filter to default state"),
    ).not.toBeInTheDocument();
  });
});
