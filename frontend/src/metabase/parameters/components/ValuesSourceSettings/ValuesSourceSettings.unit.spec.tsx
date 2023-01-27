import React from "react";
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
  it.each<ValuesQueryType>(["list", "search"])(
    "should allow changing values settings for %i",
    (type: ValuesQueryType) => {
      const { onChangeSourceSettings } = setup({
        parameter: createMockParameter({
          values_query_type: type,
        }),
      });

      userEvent.click(screen.getByRole("button", { name: "Edit" }));
      userEvent.click(screen.getByRole("radio", { name: "Custom list" }));
      userEvent.type(screen.getByRole("textbox"), "A");
      userEvent.click(screen.getByRole("button", { name: "Done" }));

      expect(onChangeSourceSettings).toHaveBeenCalledWith("static-list", {
        values: ["A"],
      });
    },
  );
});
