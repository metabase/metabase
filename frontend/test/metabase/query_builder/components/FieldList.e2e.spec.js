jest.mock("metabase/hoc/Remapped");

// Important: import of e2e_tests always comes first in tests because of mocked modules
import {
  createTestStore,
  useSharedAdminLogin,
  cleanup,
} from "__support__/e2e_tests";

import React from "react";
import { Provider } from "react-redux";
import { mount } from "enzyme";

import FieldList from "metabase/query_builder/components/FieldList";
import Question from "metabase-lib/lib/Question";
import {
  DATABASE_ID,
  ORDERS_TABLE_ID,
  orders_past_300_days_segment,
} from "__support__/sample_dataset_fixture";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import Segments from "metabase/entities/segments";
import Databases from "metabase/entities/databases";
import Tables from "metabase/entities/tables";
import { getMetadata } from "metabase/selectors/metadata";
import { TestTooltip, TestTooltipContent } from "metabase/components/Tooltip";
import Filter from "metabase/query_builder/components/Filter";

const getFieldList = (query, fieldOptions, segmentOptions) => (
  <FieldList
    table={query.table()}
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
    await store.dispatch(Databases.actions.fetchList());
    await store.dispatch(
      Tables.actions.fetchTableMetadata({ id: ORDERS_TABLE_ID }),
    );

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
    const store = await createTestStore();
    const {
      payload: { segment },
    } = await store.dispatch(
      Segments.actions.create(orders_past_300_days_segment),
    );
    cleanup.segment(segment);

    await store.dispatch(
      Databases.actions.fetchList({
        include_tables: true,
        include_cards: true,
      }),
    );
    await store.dispatch(
      Tables.actions.fetchTableMetadata({ id: ORDERS_TABLE_ID }),
    );
    await store.dispatch(Segments.actions.fetchList());
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
    ).toMatch(/Created AtPrevious 300 Days/);
  });
});
