import "__support__/mocks";
import React from "react";

import { mount } from "enzyme";

import Question from "metabase-lib/lib/Question";

import FilterPopover from "metabase/query_builder/components/filters/FilterPopover";
import DatePicker from "metabase/query_builder/components/filters/pickers/DatePicker";
import OperatorSelector from "metabase/query_builder/components/filters/OperatorSelector";
import CheckBox from "metabase/components/CheckBox";

import {
  DATABASE_ID,
  ORDERS_TABLE_ID,
  ORDERS_TOTAL_FIELD_ID,
  ORDERS_CREATED_DATE_FIELD_ID,
  ORDERS_PRODUCT_FK_FIELD_ID,
  PRODUCT_TILE_FIELD_ID,
  metadata,
  StaticEntitiesProvider,
} from "__support__/sample_dataset_fixture";

const QUERY = Question.create({
  databaseId: DATABASE_ID,
  tableId: ORDERS_TABLE_ID,
  metadata,
})
  .query()
  .addAggregation(["count"])
  .addFilter([
    "time-interval",
    ["field-id", ORDERS_CREATED_DATE_FIELD_ID],
    -30,
    "day",
  ])
  .addFilter(["=", ["field-id", ORDERS_TOTAL_FIELD_ID], 1234])
  .addFilter([
    "contains",
    ["fk->", ORDERS_PRODUCT_FK_FIELD_ID, PRODUCT_TILE_FIELD_ID],
    "asdf",
  ]);

const [
  RELATIVE_DAY_FILTER,
  NUMERIC_FILTER,
  STRING_CONTAINS_FILTER,
] = QUERY.filters();

const RELATIVE_DAY_FILTER_WITH_CURRENT_PERIOD = RELATIVE_DAY_FILTER.concat([
  { "include-current": true },
]);

describe("FilterPopover", () => {
  describe("existing filter", () => {
    describe("DatePicker", () => {
      it("should render", () => {
        const wrapper = mount(
          <FilterPopover query={QUERY} filter={QUERY.filters()[0]} />,
        );
        expect(wrapper.find(DatePicker).length).toBe(1);
      });
    });
    describe("filter operator selection", () => {
      it("should have an operator selector", () => {
        const wrapper = mount(
          <StaticEntitiesProvider>
            <FilterPopover query={QUERY} filter={NUMERIC_FILTER} />
          </StaticEntitiesProvider>,
        );
        expect(wrapper.find(OperatorSelector).length).toEqual(1);
      });
    });
    describe("filter options", () => {
      it("should not show a control to the user if the filter has no options", () => {
        const wrapper = mount(
          <StaticEntitiesProvider>
            <FilterPopover query={QUERY} filter={QUERY.filters()[1]} />
          </StaticEntitiesProvider>,
        );
        expect(wrapper.find(CheckBox).length).toBe(0);
      });
      it('should show "current-period" option to the user for "time-intervals" filters', () => {
        const wrapper = mount(
          <FilterPopover query={QUERY} filter={RELATIVE_DAY_FILTER} />,
        );
        expect(wrapper.find(CheckBox).length).toBe(1);
      });
      it('should show "case-sensitive" option to the user for "contains" filters', () => {
        const wrapper = mount(
          <StaticEntitiesProvider>
            <FilterPopover query={QUERY} filter={STRING_CONTAINS_FILTER} />
          </StaticEntitiesProvider>,
        );
        expect(wrapper.find(CheckBox).length).toBe(1);
      });
      it("should let the user toggle an option", () => {
        const wrapper = mount(
          <FilterPopover query={QUERY} filter={RELATIVE_DAY_FILTER} />,
        );

        const toggle = wrapper.find(CheckBox);
        expect(toggle.props().checked).toBe(false);
        toggle.simulate("click");

        expect(wrapper.state().filter).toEqual(
          RELATIVE_DAY_FILTER_WITH_CURRENT_PERIOD,
        );
        expect(wrapper.find(CheckBox).props().checked).toBe(true);
      });
    });
  });
});
