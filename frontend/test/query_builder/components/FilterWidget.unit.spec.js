import React from 'react'
import { shallow } from 'enzyme'

import FilterWidget from 'metabase/query_builder/components/filters/FilterWidget'
import {
    question,
    orders_past_300_days_segment
} from "__support__/sample_dataset_fixture";

describe('FilterWidget', () => {

    describe('removing filters', () => {
        it('should allow a filter to be removed', () => {
            const wrapper = shallow(
                <FilterWidget
                    query={orders_past_300_days_segment}
                    filter={{}}
                    index={1}
                />
            )

            console.log(wrapper.debug())

            const remove = wrapper.find('Icon-close')

            console.log(remove.debug())

        })
    })
})
