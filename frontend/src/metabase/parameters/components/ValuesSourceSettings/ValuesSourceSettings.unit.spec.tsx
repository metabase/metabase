import userEvent from "@testing-library/user-event";
import { Parameter, ValuesQueryType } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";
import { renderWithProviders, screen } from "__support__/ui";
import ValuesSourceSettings from "./ValuesSourceSettings";

interface SetupOpts {
  parameter: Parameter;
}

const setup = ({ parameter }: SetupOpts) => {
  const onChangeQueryType = jest.fn();
  const onChangeSourceSettings = jest.fn();

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
});
