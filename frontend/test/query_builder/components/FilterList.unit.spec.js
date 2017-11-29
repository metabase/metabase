import React from 'react'
import { shallow, mount } from 'enzyme'

import FilterList from 'metabase/query_builder/components/filters/FilterList'
import FilterWidget from 'metabase/query_builder/components/filters/FilterWidget'

import Question from "metabase-lib/lib/Question";

import {
    DATABASE_ID,
    ORDERS_TABLE_ID,
    metadata
} from "__support__/sample_dataset_fixture";

describe('FilterList', () => {

    // create a base question
    // we'll add filters to this to try out different states
    // TODO - it probably makes sense to have some better stock questions
    // in the fixture data
    const baseQuestion = Question.create({
        databaseId: DATABASE_ID,
        tableId: ORDERS_TABLE_ID,
        metadata
    })

    describe('no filters', () => {
        it('should reflect no filters', () => {
            const wrapper = shallow(
                <FilterList
                    query={baseQuestion.query()}
                    filters={baseQuestion.query().filters()}
                />
            )

            expect(wrapper.find(FilterWidget).length).toBe(0)
        })
    })
    describe('with filters', () => {
        const filteredQuestion = baseQuestion
            .query()
            .addFilter(["time-interval", ["field-id", 1], -30, "day"])
            .question();

        it('should reflect the proper number of filters', () => {
            const wrapper = shallow(
                <FilterList
                    query={filteredQuestion.query()}
                    filters={filteredQuestion.query().filters()}
                />
            )
            expect(wrapper.find(FilterWidget).length).toBe(1)
        })

        describe('changing from and to or', () => {
            it('should not show controls if there is only one filter', () => {
                const wrapper = mount(
                    <FilterList
                        query={filteredQuestion.query()}
                        filters={filteredQuestion.query().filters()}
                    />
                )
                // TODO - this selector is too brittle
                expect(wrapper.find('.text-purple-hover').length).toBe(0)

            })
            describe('with two filters, switching from and to or', () => {
                it('should properly update the filter clause', () => {
                    const updateClauseSpy = jest.fn()

                    const questionWithTwoFilters = filteredQuestion
                        .query()
                        .addFilter(["time-interval", ["filed-id", 1], 30, "day"])
                        .question()

                    const wrapper = mount(
                        <FilterList
                            filters={questionWithTwoFilters.query().filters()}
                            query={questionWithTwoFilters.query()}
                            updateClause={updateClauseSpy}
                        />
                    )

                    const switcher = wrapper.find('.text-purple-hover')

                    // there should be one switcher
                    expect(switcher.length).toBe(1)

                    switcher.simulate('click', { target: {}})

                    expect(updateClauseSpy).toHaveBeenCalled()
                })
            })
        })
    })
})


