import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import * as dashboardActions from "metabase/dashboard/actions/parameters";
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

  renderWithProviders(
    <ParameterLinkedFilters
      parameter={parameter}
      otherParameters={otherParameters}
      onChangeFilteringParameters={onChangeFilteringParameters}
    />,
  );

  return { onChangeFilteringParameters };
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
    (valuesSourceType) => {
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

  it("should show external link to docs when the parameter has values from another question", () => {
    setup({
      parameter: createMockUiParameter({
        id: "p1",
        name: "P1",
        values_source_type: "static-list",
        values_source_config: { values: ["foo", "bar"] },
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
    const link = screen.getByRole("link", { name: /Field Filters/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute(
      "href",
      "https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/sql-in-metabase/field-filters",
    );
  });

  it("should show suggestion to limit filter's choices", async () => {
    const showAddParameterPopoverSpy = jest.spyOn(
      dashboardActions,
      "showAddParameterPopover",
    );
    setup({
      parameter: createMockUiParameter({
        id: "p1",
        name: "P1",
      }),
      otherParameters: [],
    });

    expect(screen.getByText("Limit this filter's choices")).toBeInTheDocument();

    expect(
      screen.getByText(
        "If you have another dashboard filter, you can limit the choices that are listed for this filter based on the selection of the other one.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByText("add another dashboard filter"));

    expect(showAddParameterPopoverSpy).toHaveBeenCalledTimes(1);
  });
});
