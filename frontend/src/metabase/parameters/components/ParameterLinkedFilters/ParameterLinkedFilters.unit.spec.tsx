import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { ValuesSourceType } from "metabase-types/api/parameters";

import { ParameterLinkedFilters } from "./ParameterLinkedFilters";

interface SetupOpts {
  parameter: UiParameter;
  otherParameters: UiParameter[];
}

const setup = ({ parameter, otherParameters }: SetupOpts) => {
  const onChangeFilteringParameters = jest.fn();
  const onShowAddParameterPopover = jest.fn();

  renderWithProviders(
    <ParameterLinkedFilters
      parameter={parameter}
      otherParameters={otherParameters}
      onChangeFilteringParameters={onChangeFilteringParameters}
      onShowAddParameterPopover={onShowAddParameterPopover}
    />,
  );

  return { onChangeFilteringParameters, onShowAddParameterPopover };
};

describe("ParameterLinkedFilters", () => {
  it("should toggle filtering parameters", async () => {
    const { onChangeFilteringParameters } = setup({
      parameter: createMockUiParameter({
        id: "p1",
        name: "P1",
      }),
      otherParameters: [
        createMockUiParameter({
          id: "p2",
          name: "P2",
        }),
      ],
    });

    await userEvent.click(screen.getByRole("switch"));

    expect(onChangeFilteringParameters).toHaveBeenCalledWith(["p2"]);
  });

  it.each(["static-list", "card"])(
    "should not show linked filter options if the parameter has a %s source",
    valuesSourceType => {
      setup({
        parameter: createMockUiParameter({
          id: "p1",
          name: "P1",
          values_source_type: valuesSourceType as ValuesSourceType,
          values_source_config: {
            values: ["foo", "bar"],
          },
        }),
        otherParameters: [
          createMockUiParameter({
            id: "p2",
            name: "P2",
          }),
        ],
      });

      expect(
        screen.getByText(
          "If the filter has values that are from another question or model, or a custom list, then this filter can't be limited by another dashboard filter.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    },
  );

  it("should not show linked filter options if the parameter has values_query_type = 'none'", () => {
    setup({
      parameter: createMockUiParameter({
        id: "p1",
        name: "P1",
        values_query_type: "none",
        values_source_config: {
          values: ["foo", "bar"],
        },
      }),
      otherParameters: [
        createMockUiParameter({
          id: "p2",
          name: "P2",
        }),
      ],
    });

    expect(
      screen.getByText(
        "This filter can't be limited by another dashboard filter because its widget type is an input box.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });
});
