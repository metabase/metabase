import userEvent from "@testing-library/user-event";
import type { Parameter, ValuesQueryType } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { setupParameterValuesEndpoints } from "__support__/server-mocks";
import ValuesSourceSettings from "./ValuesSourceSettings";

interface SetupOpts {
  parameter: Parameter;
}

const setup = ({ parameter }: SetupOpts) => {
  const onChangeQueryType = jest.fn();
  const onChangeSourceSettings = jest.fn();
  setupParameterValuesEndpoints({ values: [], has_more_values: false });

  renderWithProviders(
    <ValuesSourceSettings
      parameter={parameter}
      onChangeQueryType={onChangeQueryType}
      onChangeSourceSettings={onChangeSourceSettings}
    />,
  );

  return { onChangeQueryType, onChangeSourceSettings };
};

describe("ValuesSourceSettings", () => {
  it.each<[string, ValuesQueryType]>([
    ["string/=", "list"],
    ["string/=", "search"],
    ["category", "list"],
    ["category", "search"],
  ])("should allow changing values settings for %s, %s", (type, queryType) => {
    const { onChangeSourceSettings } = setup({
      parameter: createMockParameter({
        type,
        values_query_type: queryType,
      }),
    });

    userEvent.click(screen.getByRole("button", { name: "Edit" }));
    userEvent.click(screen.getByRole("radio", { name: "Custom list" }));
    userEvent.type(screen.getByRole("textbox"), "A");
    userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onChangeSourceSettings).toHaveBeenCalledWith("static-list", {
      values: ["A"],
    });
  });

  it("Edit button on should be disabled with field has linked filters enabled", () => {
    setup({
      parameter: createMockParameter({
        type: "category",
        values_query_type: "list",
        id: "1",
        name: "Category",
        filteringParameters: ["2"],
      }),
    });

    userEvent.click(screen.getByRole("radio", { name: "Dropdown list Edit" }));
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
    userEvent.click(screen.getByRole("radio", { name: "Search box" }));
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
    // Test that hovering over the button shows the tooltip
    // calling .parentElement is needed because the button has pointer-events: none when disabled
    // eslint-disable-next-line testing-library/no-node-access
    userEvent.hover(
      screen.getByRole("button", { name: "Edit" }).parentElement as HTMLElement,
    );
    expect(
      screen.getByText(
        "You can’t customize selectable values for this filter because it is linked to another one.",
      ),
    ).toBeInTheDocument();
  });
});
