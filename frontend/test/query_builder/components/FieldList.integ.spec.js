jest.mock("metabase/hoc/Remapped");

// Important: import of integrated_tests always comes first in tests because of mocked modules
import {
  createTestStore,
  useSharedAdminLogin,
  cleanup,
} from "__support__/integrated_tests";

import React from "react";
import { Provider } from "react-redux";
import { mount } from "enzyme";

import FieldList from "../../../src/metabase/query_builder/components/FieldList";
import Question from "metabase-lib/lib/Question";
import {
  DATABASE_ID,
  ORDERS_TABLE_ID,
  orders_past_300_days_segment,
} from "__support__/sample_dataset_fixture";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import { createSegment } from "metabase/admin/datamodel/datamodel";
import { getMetadata } from "metabase/selectors/metadata";
import {
  fetchDatabases,
  fetchSegments,
  fetchTableMetadata,
} from "metabase/redux/metadata";
import { TestTooltip, TestTooltipContent } from "metabase/components/Tooltip";
import Filter from "metabase/query_builder/components/Filter";

const getFieldList = (query, fieldOptions, segmentOptions) => (
  <FieldList
    tableMetadata={query.tableMetadata()}
    fieldOptions={fieldOptions}
    segmentOptions={segmentOptions}
    customFieldOptions={query.expressions()}
    onFieldChange={() => {}}
    enableSubDimensions={false}
  />
);

describe("FieldList", () => {
  beforeAll(async () => {
    useSharedAdminLogin();
  });
  afterAll(cleanup);

  it("should allow using expression as aggregation dimension", async () => {
    const store = await createTestStore();
    await store.dispatch(fetchDatabases());
    await store.dispatch(fetchTableMetadata(ORDERS_TABLE_ID));

    const expressionName = "70% of subtotal";
    const metadata = getMetadata(store.getState());

    const query: StructuredQuery = Question.create({
      databaseId: DATABASE_ID,
      tableId: ORDERS_TABLE_ID,
      metadata,
    })
      .query()
      .updateExpression(expressionName, ["*", ["field-id", 4], 0.7]);

    // Use the count aggregation as an example case (this is equally valid for filters and groupings)
    const fieldOptions = query.aggregationFieldOptions("sum");
    const component = mount(getFieldList(query, fieldOptions));

    expect(
      component.find(`.List-item-title[children="${expressionName}"]`).length,
    ).toBe(1);
  });

  it("should show the query definition tooltip correctly for a segment", async () => {
    // TODO Atte Keinänen 6/27/17: Check why the result is wrapped in a promise that needs to be resolved manually
    const segment = await (await createSegment(orders_past_300_days_segment))
      .payload;
    cleanup.segment(segment);

    const store = await createTestStore();
    await store.dispatch(fetchDatabases());
    await store.dispatch(fetchTableMetadata(ORDERS_TABLE_ID));
    await store.dispatch(fetchSegments());
    const metadata = getMetadata(store.getState());

    const query: StructuredQuery = Question.create({
      databaseId: DATABASE_ID,
      tableId: ORDERS_TABLE_ID,
      metadata,
    }).query();
    const component = mount(
      <Provider store={store}>
        {getFieldList(
          query,
          query.filterFieldOptions(),
          query.filterSegmentOptions(),
        )}
      </Provider>,
    );

    // TODO: This is pretty awkward – each list item could have its own React component for easier traversal
    // Maybe also TestTooltip should provide an interface (like `tooltipWrapper.instance().show()`) for toggling it?
    const tooltipTarget = component
      .find(`.List-item-title[children="${segment.name}"]`)
      .first()
      .closest(".List-item")
      .find(".QuestionTooltipTarget")
      .parent();

    tooltipTarget.simulate("mouseenter");

    const tooltipContent = tooltipTarget
      .closest(TestTooltip)
      .find(TestTooltipContent);
    expect(tooltipContent.length).toBe(1);

    expect(
      tooltipContent
        .find(Filter)
        .last()
        .text(),
      // eslint-disable-next-line no-irregular-whitespace
    ).toMatch(/Created AtPast 300 Days/);
  });
});
