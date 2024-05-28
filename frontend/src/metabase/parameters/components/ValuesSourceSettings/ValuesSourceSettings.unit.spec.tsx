import userEvent from "@testing-library/user-event";

import { setupParameterValuesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { Parameter, ValuesQueryType } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

import { ValuesSourceSettings } from "./ValuesSourceSettings";

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
  ])(
    "should allow changing values settings for %s, %s",
    async (type, queryType) => {
      const { onChangeSourceSettings } = setup({
        parameter: createMockParameter({
          type,
          values_query_type: queryType,
        }),
      });

      await userEvent.click(screen.getByRole("button", { name: "Edit" }));
      await userEvent.click(screen.getByRole("radio", { name: "Custom list" }));
      await userEvent.type(screen.getByRole("textbox"), "A");
      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      expect(onChangeSourceSettings).toHaveBeenCalledWith("static-list", {
        values: ["A"],
      });
    },
  );

  it("editing the values source should be disabled when the filter has linked filters", async () => {
    setup({
      parameter: createMockParameter({
        filteringParameters: ["2"],
      }),
    });

    await userEvent.click(screen.getByRole("radio", { name: "Dropdown list" }));
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: "Search box" }));
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();

    // hovering over the button shows the tooltip"
    await userEvent.hover(
      screen.getByTestId("values-source-settings-edit-btn"),
    );
    expect(
      screen.getByText(
        "You can’t customize selectable values for this filter because it is linked to another one.",
      ),
    ).toBeInTheDocument();
  });

  it("Editing the values source should be enabled when the filter has no linked filters", async () => {
    setup({
      parameter: createMockParameter({
        filteringParameters: [],
      }),
    });

    await userEvent.click(screen.getByRole("radio", { name: "Dropdown list" }));
    expect(screen.getByRole("button", { name: "Edit" })).toBeEnabled();
    await userEvent.click(screen.getByRole("radio", { name: "Search box" }));
    expect(screen.getByRole("button", { name: "Edit" })).toBeEnabled();

    // hovering over the button doesn't show the tooltip
    await userEvent.hover(
      screen.getByTestId("values-source-settings-edit-btn"),
    );
    expect(
      screen.queryByText(
        "You can’t customize selectable values for this filter because it is linked to another one.",
      ),
    ).not.toBeInTheDocument();
  });
});
