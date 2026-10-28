import userEvent from "@testing-library/user-event";

import {
  setupDatabaseEndpoints,
  setupFieldsValuesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCT_CATEGORY_VALUES,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { MultiStageFilterPicker } from "./MultiStageFilterPicker";

type SetupOpts = {
  query: Lib.Query;
  canAppendStage?: boolean;
};

function setup({ query, canAppendStage = true }: SetupOpts) {
  const onChange = jest.fn();
  const onClose = jest.fn();

  renderWithProviders(
    <MultiStageFilterPicker
      query={query}
      canAppendStage={canAppendStage}
      onChange={onChange}
      onClose={onClose}
    />,
  );

  const getNewQuery = (): Lib.Query => {
    return onChange.mock.lastCall[0];
  };

  return { getNewQuery, onChange, onClose };
}

describe("MultiStageFilterPicker", () => {
  it("should drop empty stages if there is no filter in a post-aggregation stage (metabase#57573)", async () => {
    const { getNewQuery } = setup({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count", args: [] }],
            breakouts: [
              {
                type: "column",
                name: "CATEGORY",
                sourceFieldId: ORDERS.PRODUCT_ID,
              },
            ],
          },
        ],
      }),
    });
    expect(screen.getByText("Summaries")).toBeInTheDocument();

    await userEvent.click(screen.getByText("ID"));
    await userEvent.type(screen.getByPlaceholderText("Enter an ID"), "10");
    await userEvent.click(screen.getByRole("button", { name: "Apply filter" }));

    const newQuery = getNewQuery();
    expect(Lib.stageCount(newQuery)).toBe(1);
    expect(Lib.filters(newQuery, 0)).toHaveLength(1);
  });

  it("should list every summary stage and add another filter to a later stage", async () => {
    setupDatabaseEndpoints(createSampleDatabase());
    setupFieldsValuesEndpoints([PRODUCT_CATEGORY_VALUES]);
    const summaryStage = {
      aggregations: [{ type: "operator" as const, operator: "count" as const }],
      breakouts: [{ type: "column" as const, name: "CATEGORY" }],
    };
    const { getNewQuery, onChange, onClose } = setup({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count" }],
            breakouts: [
              {
                type: "column",
                name: "CATEGORY",
                sourceFieldId: ORDERS.PRODUCT_ID,
              },
            ],
          },
          summaryStage,
          summaryStage,
        ],
      }),
    });
    expect(screen.getByText("Summaries")).toBeInTheDocument();
    expect(screen.getByText("Summaries (2)")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Summaries (3)"));
    await userEvent.click(screen.getByText("Product → Category"));
    await userEvent.click(await screen.findByLabelText("Gizmo"));
    await userEvent.click(
      screen.getByRole("button", { name: "Add another filter" }),
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(expect.anything(), {
      run: false,
    });
    expect(onClose).not.toHaveBeenCalled();
    const newQuery = getNewQuery();
    expect(Lib.stageCount(newQuery)).toBe(4);
    expect(Lib.filters(newQuery, 3)).toHaveLength(1);
    expect(screen.getByText("Summaries (3)")).toBeInTheDocument();
  });

  it("should not drop the post-aggregation stage if there is a new filter", async () => {
    const { getNewQuery } = setup({
      query: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count", args: [] }],
            breakouts: [
              {
                type: "column",
                name: "CATEGORY",
                sourceFieldId: ORDERS.PRODUCT_ID,
              },
            ],
          },
        ],
      }),
    });
    expect(screen.getByText("Summaries")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Summaries"));
    await userEvent.click(screen.getByText("Count"));
    await userEvent.type(screen.getByPlaceholderText("Min"), "10");
    await userEvent.click(screen.getByRole("button", { name: "Apply filter" }));

    const newQuery = getNewQuery();
    expect(Lib.stageCount(newQuery)).toBe(2);
    expect(Lib.filters(newQuery, 0)).toHaveLength(0);
    expect(Lib.filters(newQuery, 1)).toHaveLength(1);
  });
});
