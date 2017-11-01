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

    describe('default state', () => {
        it('should render default actions supplied to it', () => {
            const wrapper = shallow(
                <Header
                    item={TEST_ITEM}
                    defaultActions={[[
                        <a className='default-action'>One</a>,
                        <a className='default-action'>Two</a>,
                    ]]}
                    editingActions={[[
                        <a className='edit-action'>One</a>,
                        <a className='edit-action'>Two</a>,
                    ]]}
                />
            )
            expect(wrapper.find('.default-action').length).toBe(2)
            expect(wrapper.find('.edit-action').length).toBe(0)
        })
    })

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

        it('should render edit actions when editing', () => {
            const wrapper = shallow(
                <Header
                    item={TEST_ITEM}
                    isEditing={true}
                    defaultActions={[[
                        <a className='default-action'>One</a>,
                        <a className='default-action'>Two</a>,
                    ]]}
                    editingActions={[[
                        <a className='edit-action'>One</a>,
                        <a className='edit-action'>Two</a>,
                    ]]}
                />
            )


            expect(wrapper.find('.default-action').length).toBe(0)
            expect(wrapper.find('.edit-action').length).toBe(2)
        })

        it('should render inputs when editing info', () => {
            const wrapper = shallow(
                <Header
                    item={TEST_ITEM}
                    isEditing={true}
                />
            )

            expect(wrapper.find(Input).length).toBe(2)
        })
    })
    describe('fullscreen', () => {
        it('should render fullscreen actions when in fullscreen', () => {
            const wrapper = shallow(
                <Header
                    item={TEST_ITEM}
                    isFullscreen={true}
                    defaultActions={[[
                        <a className='default-action'>One</a>,
                        <a className='default-action'>Two</a>,
                    ]]}
                    fullscreenActions={[[
                        <a className='fullscreen-action'>One</a>,
                        <a className='fullscreen-action'>Two</a>,
                    ]]}
                />
            )


            expect(wrapper.find('.default-action').length).toBe(0)
            expect(wrapper.find('.fullscreen-action').length).toBe(2)
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
