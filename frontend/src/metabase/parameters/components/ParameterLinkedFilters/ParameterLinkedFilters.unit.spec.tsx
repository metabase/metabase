import userEvent from "@testing-library/user-event";

import { setupValidFilterFieldsEndpoint } from "__support__/server-mocks";
import { getIcon, renderWithProviders, screen, within } from "__support__/ui";
import * as dashboardActions from "metabase/dashboard/actions/parameters";
import { checkNotNull } from "metabase/lib/types";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { FieldId } from "metabase-types/api";
import { ORDERS, PEOPLE, PRODUCTS } from "metabase-types/api/mocks/presets";
import type { ValuesSourceType } from "metabase-types/api/parameters";

import { ParameterLinkedFilters } from "./ParameterLinkedFilters";

interface SetupOpts {
  parameter: UiParameter;
  otherParameters: UiParameter[];
  filteringIdsByFilteredId?: Record<FieldId, FieldId[]>;
}

const setup = ({
  parameter,
  otherParameters,
  filteringIdsByFilteredId = {},
}: SetupOpts) => {
  const onChangeFilteringParameters = jest.fn();
  setupValidFilterFieldsEndpoint(filteringIdsByFilteredId);

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
        fields: [checkNotNull(SAMPLE_METADATA.field(PRODUCTS.CATEGORY))],
      }),
      otherParameters: [
        createMockUiParameter({
          id: "p2",
          name: "P2",
          fields: [checkNotNull(SAMPLE_METADATA.field(PRODUCTS.VENDOR))],
        }),
      ],
      filteringIdsByFilteredId: {
        [PRODUCTS.CATEGORY]: [PRODUCTS.VENDOR],
      },
    });

    await userEvent.click(await screen.findByRole("switch"));

    expect(onChangeFilteringParameters).toHaveBeenCalledWith(["p2"]);
  });

  it("should display parameters that cannot be linked in a separate section", async () => {
    setup({
      parameter: createMockUiParameter({
        id: "p1",
        name: "P1",
        fields: [
          checkNotNull(SAMPLE_METADATA.field(PRODUCTS.CREATED_AT)),
          checkNotNull(SAMPLE_METADATA.field(ORDERS.CREATED_AT)),
        ],
      }),
      otherParameters: [
        createMockUiParameter({
          id: "p2",
          name: "P2",
          fields: [
            checkNotNull(SAMPLE_METADATA.field(ORDERS.ID)),
            checkNotNull(SAMPLE_METADATA.field(PEOPLE.CREATED_AT)),
          ],
        }),
        createMockUiParameter({
          id: "p3",
          name: "P3",
          fields: [checkNotNull(SAMPLE_METADATA.field(PEOPLE.CREATED_AT))],
        }),
      ],
      filteringIdsByFilteredId: {
        [PRODUCTS.CREATED_AT]: [ORDERS.CREATED_AT, ORDERS.ID],
      },
    });

    const compatibleSection = await screen.findByTestId(
      "compatible-parameters",
    );
    const incompatibleSection = screen.getByTestId("incompatible-parameters");
    expect(within(compatibleSection).getByText("P2")).toBeInTheDocument();
    expect(within(incompatibleSection).getByText("P3")).toBeInTheDocument();

    await userEvent.hover(getIcon("info"));
    expect(
      await screen.findByText(/foreign-key relationship/),
    ).toBeInTheDocument();
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
