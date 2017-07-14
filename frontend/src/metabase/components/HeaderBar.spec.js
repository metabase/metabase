import React from 'react'
import { shallow } from 'enzyme'

import HeaderBar from 'metabase/components/HeaderBar';
import Input from "metabase/components/Input.jsx";
import TitleAndDescription from 'metabase/components/TitleAndDescription';

describe('HeaderBar', () => {

    it('should render a TitleAndDescription component when name and description are passed', () => {
        const component = shallow(<HeaderBar name='This is a thing' description='This is the description of the thing' />)

        expect(component.find(TitleAndDescription).length).toEqual(1)
    })

    describe('badges, of which we have no stinking need ', () => {
        it('should provide space for and render a badge if a badge is passed as props', () => {
            const component = shallow(<HeaderBar name='Name' badge='derp' />)

            expect(component.contains('derp')).toEqual(true)
        })
    })

    describe('breadcrumbs', () => {
        it('')
    })


    describe('editing', () => {
        it('should render inputs if the name and description are being edited', () => {
            const component = shallow(<HeaderBar name='Name' isEditing={true}  />)

            expect(component.find(Input).length).toEqual(2)
        })
    })

    describe('buttons', () => {
        it('should render buttons passed to it', () => {
            const buttons = [
                <div>Hey</div>,
                <div>Yo</div>
            ]

            const component = shallow(<HeaderBar name='Name' buttons={buttons} />)

            expect(component.contains(<div>Hey</div>)).toEqual(true)
            expect(component.contains(<div>Yo</div>)).toEqual(true)
        })
    })
})
