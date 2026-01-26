import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  SAMPLE_DATABASE,
  SAMPLE_PROVIDER,
  createTestQuery,
} from "metabase-lib/test-helpers";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

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
      query: createTestQuery(SAMPLE_PROVIDER, {
        databaseId: SAMPLE_DATABASE.id,
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count", args: [] }],
            breakouts: [{ name: "CATEGORY" }],
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

  it("should not drop the post-aggregation stage if there is a new filter", async () => {
    const { getNewQuery } = setup({
      query: createTestQuery(SAMPLE_PROVIDER, {
        databaseId: SAMPLE_DATABASE.id,
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count", args: [] }],
            breakouts: [{ name: "CATEGORY" }],
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
