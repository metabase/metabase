import userEvent from "@testing-library/user-event";

import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { dashboardClickActionMode } from "metabase/dashboard/click-behavior/mode";
import type { Path } from "metabase/router";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { Card, ClickBehavior } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

registerVisualizations();

beforeAll(() => loadVisualizationComponents(["progress"]));

const COUNT_COLUMN = createMockColumn({
  name: "count",
  display_name: "count",
  source: "native",
  base_type: "type/Integer",
  effective_type: "type/Integer",
  field_ref: ["field", "count", { "base-type": "type/Integer" }],
});
const TARGET_CARD = createNativeCard({ id: 10, name: "Orders" });
const CLICK_BEHAVIOR: ClickBehavior = {
  type: "link",
  linkType: "question",
  targetId: TARGET_CARD.id,
  parameterMapping: {},
};
const PROGRESS_CARD = createNativeCard({
  id: 1,
  display: "progress",
  result_metadata: [COUNT_COLUMN],
  visualization_settings: {
    "progress.value": "count",
    "progress.goal": 2000,
    click_behavior: CLICK_BEHAVIOR,
  },
});

function createNativeCard(opts: Partial<Card>) {
  return createMockCard({
    ...opts,
    query_type: "native",
    dataset_query: Lib.toJsQuery(
      Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
        query: "SELECT 1112 AS count",
      }),
    ),
  });
}

function setup() {
  const onSameOriginNavigation = jest.fn<void, [Partial<Path>]>();
  const series = createMockSingleSeries(PROGRESS_CARD, {
    data: createMockDatasetData({
      cols: [COUNT_COLUMN],
      rows: [[1112]],
    }),
  });

  renderWithProviders(
    <Visualization
      rawSeries={[series]}
      mode={dashboardClickActionMode}
      getExtraDataForClick={() => ({
        questions: { [TARGET_CARD.id]: TARGET_CARD },
        dashboards: {},
        parameters: [],
      })}
      onSameOriginNavigation={onSameOriginNavigation}
    />,
    {
      storeInitialState: createMockState({
        entities: createMockEntitiesState({
          databases: [createSampleDatabase()],
          questions: [PROGRESS_CARD, TARGET_CARD],
        }),
      }),
    },
  );

  return { onSameOriginNavigation };
}

describe("progress card click behavior", () => {
  it("follows its question click behavior on a dashboard card (metabase#23137)", async () => {
    const { onSameOriginNavigation } = setup();

    await userEvent.click(await screen.findByTestId("progress-bar"));

    expect(onSameOriginNavigation).toHaveBeenCalledTimes(1);
    expect(onSameOriginNavigation).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/question/10-orders" }),
    );
  });
});
