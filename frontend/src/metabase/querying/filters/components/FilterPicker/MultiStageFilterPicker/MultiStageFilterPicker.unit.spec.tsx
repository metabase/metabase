import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  setupDatabaseEndpoints,
  setupFieldsValuesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCT_CATEGORY_VALUES,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import type { FilterChangeOpts } from "../types";

import { MultiStageFilterPicker } from "./MultiStageFilterPicker";

type SetupOpts = {
  query: Lib.Query;
  canAppendStage?: boolean;
};

function setup({ query, canAppendStage = true }: SetupOpts) {
  const onChange = jest.fn<void, [Lib.Query, FilterChangeOpts]>();
  const onClose = jest.fn();

  function Wrapper() {
    const [currentQuery, setCurrentQuery] = useState(query);

    const handleChange = (newQuery: Lib.Query, opts: FilterChangeOpts) => {
      setCurrentQuery(newQuery);
      onChange(newQuery, opts);
    };

    return (
      <MultiStageFilterPicker
        query={currentQuery}
        canAppendStage={canAppendStage}
        onChange={handleChange}
        onClose={onClose}
      />
    );
  }

  renderWithProviders(<Wrapper />);

  const getNewQuery = (): Lib.Query => {
    const [newQuery] = checkNotNull(onChange.mock.lastCall);
    return newQuery;
  };

  return { getNewQuery, onChange, onClose };
}

function createSummarizedQuery() {
  const summaryStage = {
    aggregations: [{ type: "operator" as const, operator: "count" as const }],
    breakouts: [{ type: "column" as const, name: "CATEGORY" }],
  };
  return Lib.createTestQuery(SAMPLE_PROVIDER, {
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
  });
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

  it("should add filters to several summary stages in one session", async () => {
    setupDatabaseEndpoints(createSampleDatabase());
    setupFieldsValuesEndpoints([PRODUCT_CATEGORY_VALUES]);
    const { getNewQuery, onChange, onClose } = setup({
      query: createSummarizedQuery(),
    });
    expect(screen.getByText("Summaries")).toBeInTheDocument();
    expect(screen.getByText("Summaries (2)")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Summaries (3)"));
    await userEvent.click(screen.getByText("Product → Category"));
    await userEvent.click(await screen.findByLabelText("Gizmo"));
    await userEvent.click(
      screen.getByRole("button", { name: "Add another filter" }),
    );
    expect(
      screen.queryByRole("button", { name: "Add another filter" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Summaries (3)")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Summaries"));
    await userEvent.click(screen.getByText("Product → Category"));
    await userEvent.click(await screen.findByLabelText("Gadget"));
    await userEvent.click(
      screen.getByRole("button", { name: "Add another filter" }),
    );

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onClose).not.toHaveBeenCalled();
    const newQuery = getNewQuery();
    expect(Lib.stageCount(newQuery)).toBe(4);
    expect(Lib.filters(newQuery, 1)).toHaveLength(1);
    expect(Lib.filters(newQuery, 3)).toHaveLength(1);
  });

  it.each([
    { label: "Apply filter", run: true },
    { label: "Add another filter", run: false },
  ])(
    "should add a filter to a later summary stage with '$label'",
    async ({ label, run }) => {
      setupDatabaseEndpoints(createSampleDatabase());
      setupFieldsValuesEndpoints([PRODUCT_CATEGORY_VALUES]);
      const { getNewQuery, onChange, onClose } = setup({
        query: createSummarizedQuery(),
      });

      await userEvent.click(screen.getByText("Summaries (3)"));
      await userEvent.click(screen.getByText("Product → Category"));
      await userEvent.click(await screen.findByLabelText("Gizmo"));
      await userEvent.click(screen.getByRole("button", { name: label }));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenLastCalledWith(expect.anything(), { run });
      expect(onClose).toHaveBeenCalledTimes(run ? 1 : 0);
      const newQuery = getNewQuery();
      expect(Lib.stageCount(newQuery)).toBe(4);
      expect(Lib.filters(newQuery, 3)).toHaveLength(1);
    },
  );

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
