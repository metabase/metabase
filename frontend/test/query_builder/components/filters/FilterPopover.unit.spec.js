import React from 'react'
import { shallow, mount } from 'enzyme'

import Question from "metabase-lib/lib/Question";

import FilterPopover from 'metabase/query_builder/components/filters/FilterPopover'
import DatePicker from 'metabase/query_builder/components/filters/pickers/DatePicker'
import CheckBox from 'metabase/components/CheckBox'

import {
    DATABASE_ID,
    ORDERS_TABLE_ID,
    ORDERS_TOTAL_FIELD_ID,
    ORDERS_CREATED_DATE_FIELD_ID,
    metadata
} from "__support__/sample_dataset_fixture";

const RELATIVE_DAY_FILTER = ["time-interval", ["field-id", ORDERS_CREATED_DATE_FIELD_ID], -30, "day"]

const FILTER_WITH_CURRENT_PERIOD = RELATIVE_DAY_FILTER.concat([
    {"include-current": true }
])

const NUMERIC_FILTER = ["=", ["field-id", ORDERS_TOTAL_FIELD_ID], 1234];

const QUERY = Question.create({
    databaseId: DATABASE_ID,
    tableId: ORDERS_TABLE_ID,
    metadata
})
.query()
.addAggregation(["count"])
.addFilter(RELATIVE_DAY_FILTER)
.addFilter(NUMERIC_FILTER)

describe('FilterPopover', () => {
    describe('existing filter', () => {
        describe('DatePicker', () => {
            it('should render', () => {
                const wrapper = shallow(
                    <FilterPopover
                        query={QUERY}
                        filter={QUERY.filters()[0]}
                    />
                )
                expect(wrapper.find(DatePicker).length).toBe(1)
            })
        })
        describe('including the current period', () => {
            it('should not show a control to the user for the appropriate types of queries', () => {
                const wrapper = mount(
                    <FilterPopover
                        query={QUERY}
                        filter={QUERY.filters()[1]}
                    />
                )
                expect(wrapper.find(CheckBox).length).toBe(0)
            })
            it('should show a control to the user for the appropriate types of queries', () => {
                const wrapper = mount(
                    <FilterPopover
                        query={QUERY}
                        filter={QUERY.filters()[0]}
                    />
                )
                expect(wrapper.find(CheckBox).length).toBe(1)
            })
            it('should let the user toggle', () => {
                const wrapper = mount(
                    <FilterPopover
                        query={QUERY}
                        filter={QUERY.filters()[0]}
                    />
                )

                const toggle = wrapper.find(CheckBox)
                expect(toggle.props().checked).toBe(false)
                toggle.simulate('click')

                expect(wrapper.state().filter).toEqual(FILTER_WITH_CURRENT_PERIOD)
                expect(wrapper.find(CheckBox).props().checked).toBe(true)
            })
        })
    })
})
