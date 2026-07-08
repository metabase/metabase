import { renderWithProviders, screen } from "__support__/ui";
import type { ParameterMappingOption } from "metabase/parameters/utils/mapping-options";
import type { ParameterTarget } from "metabase-types/api";

import { ParameterTargetWidget } from "./ParameterTargetWidget";

const TARGET = ["variable", ["template-tag", "foo"]] as ParameterTarget;

const OPTION = {
  name: "Foo column",
  target: TARGET,
  icon: "string",
} as unknown as ParameterMappingOption;

const setup = (
  props: Partial<React.ComponentProps<typeof ParameterTargetWidget>> = {},
) =>
  renderWithProviders(
    <ParameterTargetWidget
      target={undefined}
      onChange={jest.fn()}
      mappingOptions={[OPTION]}
      {...props}
    />,
  );

describe("ParameterTargetWidget", () => {
  it("shows the placeholder when nothing is selected", () => {
    setup({ placeholder: "Pick a column" });

    expect(screen.getByText("Pick a column")).toBeInTheDocument();
  });

  it("shows the selected option's name when the target matches", () => {
    setup({ target: TARGET });

    expect(screen.getByText("Foo column")).toBeInTheDocument();
  });

  it("falls back to a default label when no placeholder is given", () => {
    setup();

    expect(screen.getByText("Select a target")).toBeInTheDocument();
  });

  it("disables the trigger when there are no mapping options", () => {
    setup({ mappingOptions: [] });

    expect(
      screen.getByText("Select a target").closest(".disabled"),
    ).toBeTruthy();
  });
});
