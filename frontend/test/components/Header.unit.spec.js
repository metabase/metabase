import React from 'react'
import { shallow } from 'enzyme'

import EditBar from 'metabase/components/EditBar'
import Header from 'metabase/components/Header'
import Input from 'metabase/components/Input'
import TitleAndDescription from 'metabase/components/TitleAndDescription'

const TEST_ITEM =  {
    name: 'A good thing',
    description: `It's good. Didn't you read the title?`
}

describe('Header', () => {
    describe('edit state', () => {
        it('should render an edit bar when editing', () => {
            const wrapper = shallow(
                <Header
                    item={TEST_ITEM}
                    isEditing={true}
                />
            )

            expect(wrapper.find(EditBar).length).toBe(1)
        })

        it('should render inputs when editing', () => {
            const wrapper = shallow(
                <Header
                    item={TEST_ITEM}
                    // TODO - seems weird you have to set both of these
                    isEditingInfo={true}
                />
            )

            expect(wrapper.find(Input).length).toBe(2)
        })
    })

    describe('new things', () => {
        it('should reflect that an object is new', () => {
            const wrapper = shallow(
                <Header
                    objectType='dashboard'
                    item={{ id: null }}
                />
            )

            const title = wrapper.find(TitleAndDescription)
            expect(title.props().title).toEqual('New dashboard')
        })
    })
})
