import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupMockIntersectionObserver } from "__support__/intersection-observer";
import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionsEndpoints,
  setupDatabaseEndpoints,
  setupMetricDatasetEndpoint,
  setupMetricEndpoint,
} from "__support__/server-mocks";
import { setupBookmarksEndpoints } from "__support__/server-mocks/bookmark";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { Route } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  DimensionMapping,
  FieldId,
  MetricDimension,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockField,
  createMockMetric,
  createMockMetricDimension,
  createMockNumericColumn,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PEOPLE_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { MetricOverviewPage } from "./MetricOverviewPage";

registerVisualizations();

const SAMPLE_DB = createSampleDatabase();
const CARD_ID = 42;

type DimensionSpec = {
  name: string;
  tableId: number;
  fieldId: FieldId;
  sourceFieldId?: FieldId;
  effectiveType: string;
  semanticType: string | null;
};

// The metric's own columns in table order, as seeding adds them, then the
// columns added from connected tables.
const DIMENSION_SPECS: DimensionSpec[] = [
  {
    name: "ID",
    tableId: ORDERS_ID,
    fieldId: ORDERS.ID,
    effectiveType: "type/BigInteger",
    semanticType: "type/PK",
  },
  {
    name: "User ID",
    tableId: ORDERS_ID,
    fieldId: ORDERS.USER_ID,
    effectiveType: "type/Integer",
    semanticType: "type/FK",
  },
  {
    name: "Product ID",
    tableId: ORDERS_ID,
    fieldId: ORDERS.PRODUCT_ID,
    effectiveType: "type/Integer",
    semanticType: "type/FK",
  },
  {
    name: "Subtotal",
    tableId: ORDERS_ID,
    fieldId: ORDERS.SUBTOTAL,
    effectiveType: "type/Float",
    semanticType: null,
  },
  {
    name: "Tax",
    tableId: ORDERS_ID,
    fieldId: ORDERS.TAX,
    effectiveType: "type/Float",
    semanticType: null,
  },
  {
    name: "Total",
    tableId: ORDERS_ID,
    fieldId: ORDERS.TOTAL,
    effectiveType: "type/Float",
    semanticType: null,
  },
  {
    name: "Discount",
    tableId: ORDERS_ID,
    fieldId: ORDERS.DISCOUNT,
    effectiveType: "type/Float",
    semanticType: "type/Discount",
  },
  {
    name: "Created At",
    tableId: ORDERS_ID,
    fieldId: ORDERS.CREATED_AT,
    effectiveType: "type/DateTime",
    semanticType: "type/CreationTimestamp",
  },
  {
    name: "Quantity",
    tableId: ORDERS_ID,
    fieldId: ORDERS.QUANTITY,
    effectiveType: "type/Integer",
    semanticType: "type/Quantity",
  },
  {
    name: "Category",
    tableId: PRODUCTS_ID,
    fieldId: PRODUCTS.CATEGORY,
    sourceFieldId: ORDERS.PRODUCT_ID,
    effectiveType: "type/Text",
    semanticType: "type/Category",
  },
  {
    name: "Price",
    tableId: PRODUCTS_ID,
    fieldId: PRODUCTS.PRICE,
    sourceFieldId: ORDERS.PRODUCT_ID,
    effectiveType: "type/Float",
    semanticType: null,
  },
  {
    name: "Rating",
    tableId: PRODUCTS_ID,
    fieldId: PRODUCTS.RATING,
    sourceFieldId: ORDERS.PRODUCT_ID,
    effectiveType: "type/Float",
    semanticType: "type/Score",
  },
  {
    name: "Title",
    tableId: PRODUCTS_ID,
    fieldId: PRODUCTS.TITLE,
    sourceFieldId: ORDERS.PRODUCT_ID,
    effectiveType: "type/Text",
    semanticType: "type/Title",
  },
  {
    name: "Vendor",
    tableId: PRODUCTS_ID,
    fieldId: PRODUCTS.VENDOR,
    sourceFieldId: ORDERS.PRODUCT_ID,
    effectiveType: "type/Text",
    semanticType: "type/Company",
  },
  {
    name: "City",
    tableId: PEOPLE_ID,
    fieldId: PEOPLE.CITY,
    sourceFieldId: ORDERS.USER_ID,
    effectiveType: "type/Text",
    semanticType: "type/City",
  },
  {
    name: "Source",
    tableId: PEOPLE_ID,
    fieldId: PEOPLE.SOURCE,
    sourceFieldId: ORDERS.USER_ID,
    effectiveType: "type/Text",
    semanticType: "type/Source",
  },
  {
    name: "State",
    tableId: PEOPLE_ID,
    fieldId: PEOPLE.STATE,
    sourceFieldId: ORDERS.USER_ID,
    effectiveType: "type/Text",
    semanticType: "type/State",
  },
];

function getDimensionId(name: string) {
  return `dimension-${name.toLowerCase().replace(/ /g, "-")}`;
}

const DIMENSIONS: MetricDimension[] = DIMENSION_SPECS.map((spec) =>
  createMockMetricDimension({
    id: getDimensionId(spec.name),
    display_name: spec.name,
    effective_type: spec.effectiveType,
    semantic_type: spec.semanticType,
    status: "status/active",
  }),
);

const DIMENSION_MAPPINGS: DimensionMapping[] = DIMENSION_SPECS.map((spec) => ({
  dimension_id: getDimensionId(spec.name),
  table_id: spec.tableId,
  target: [
    "field",
    spec.sourceFieldId != null ? { "source-field": spec.sourceFieldId } : {},
    spec.fieldId,
  ],
}));

const CHARTED_DIMENSION_NAMES = DIMENSION_SPECS.slice(3).map(
  (spec) => spec.name,
);

function setup() {
  const card = createMockCard({
    id: CARD_ID,
    type: "metric",
    name: "Orders over time",
    database_id: SAMPLE_DB_ID,
    table_id: ORDERS_ID,
    can_write: true,
    result_metadata: [
      createMockField({ name: "count", base_type: "type/Integer" }),
    ],
    dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
        },
      ],
    }),
  });

  setupDatabaseEndpoints(SAMPLE_DB);
  setupCardEndpoints(card);
  setupCardQueryMetadataEndpoint(
    card,
    createMockCardQueryMetadata({ databases: [SAMPLE_DB] }),
  );
  setupCardQueryEndpoints(
    card,
    createMockDataset({
      data: createMockDatasetData({
        cols: [createMockNumericColumn({ name: "count" })],
        rows: [[18760]],
      }),
    }),
  );
  setupMetricEndpoint(
    createMockMetric({
      id: CARD_ID,
      name: card.name,
      dimensions: DIMENSIONS,
      dimension_mappings: DIMENSION_MAPPINGS,
    }),
  );
  setupMetricDatasetEndpoint(
    createMockDataset({
      data: createMockDatasetData({
        cols: [
          createMockColumn({ name: "dimension", base_type: "type/Text" }),
          createMockNumericColumn({ name: "count" }),
        ],
        rows: [["A", 1]],
      }),
    }),
  );
  setupCollectionsEndpoints({ collections: [createMockCollection()] });
  setupBookmarksEndpoints([]);
  setupListNotificationEndpoints({ card_id: CARD_ID }, []);

  renderWithProviders(
    <Route path="/metric/:cardId/overview" element={<MetricOverviewPage />} />,
    { withRouter: true, initialRoute: `/metric/${CARD_ID}/overview` },
  );
}

function getCardTitles() {
  return within(screen.getByTestId("metric-overview-page"))
    .queryAllByText(/^By /)
    .map((title) => title.textContent);
}

describe("MetricOverviewPage", () => {
  const intersectionObserver = setupMockIntersectionObserver();
  let trackSimpleEvent: jest.SpiedFunction<typeof Analytics.trackSimpleEvent>;

  beforeEach(() => {
    trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
  });

  afterEach(() => {
    trackSimpleEvent.mockRestore();
  });

  it("renders the curated dimension charts in order, loads more on scroll, then on Show more", async () => {
    setup();

    await waitFor(() => {
      expect(getCardTitles()).toEqual(
        CHARTED_DIMENSION_NAMES.slice(0, 4).map((name) => `By ${name}`),
      );
    });
    expect(
      screen.queryByRole("button", { name: /Show more/ }),
    ).not.toBeInTheDocument();

    // The trigger at the end of the grid is in view, but more charts load
    // only once the user scrolls.
    intersectionObserver.setAllIntersecting(true);
    expect(getCardTitles()).toHaveLength(4);
    fireEvent.wheel(window, { deltaY: 100 });

    await waitFor(() => {
      expect(getCardTitles()).toEqual(
        CHARTED_DIMENSION_NAMES.slice(0, 10).map((name) => `By ${name}`),
      );
    });
    expect(trackSimpleEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "metric_page_show_more_clicked" }),
    );

    await userEvent.click(screen.getByRole("button", { name: /Show more/ }));

    expect(getCardTitles()).toEqual(
      CHARTED_DIMENSION_NAMES.map((name) => `By ${name}`),
    );
    expect(getCardTitles()).toHaveLength(14);
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "metric_page_show_more_clicked",
      target_id: CARD_ID,
    });
    expect(fetchMock.callHistory.called("metric-dataset")).toBe(true);
  });
});
