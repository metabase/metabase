import React from 'react'
import { mount } from 'enzyme';
import { ObjectDetail } from 'metabase/visualizations/visualizations/ObjectDetail'

import { TYPE } from "metabase/lib/types";

const objectDetailCard = {
    card: {
        display: "object"
    },
    data: {
        cols: [{
            display_name: "Details",
            special_type: TYPE.SerializedJSON
        }],
        columns: [
            "details"
        ],
        rows: [
            [JSON.stringify({hey: "yo"})]
        ]
    }
}

describe('ObjectDetail', () => {
    describe('json field rendering', () => {
        it('should properly display JSON special type data as JSON', () => {
            const detail = mount(
                <ObjectDetail
                    data={objectDetailCard.data}
                    series={objectDetailCard}
                    loadObjectDetailFKReferences={() => ({})}
                />
            )

            expect(detail.find('.ObjectJSON').length).toEqual(1)
        })
    })
})
