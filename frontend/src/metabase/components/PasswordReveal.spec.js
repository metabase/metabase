import React from 'react'
import PasswordReveal from './PasswordReveal'
import CopyButton from 'metabase/components/CopyButton'

import { shallow } from 'enzyme'

describe('password reveal', () => {
    let wrapper

    beforeEach(() => {
        wrapper = shallow(<PasswordReveal />)
    })

    it('should toggle the visibility state when hide / show are clicked', () => {
        expect(wrapper.state().visible).toEqual(false)
        wrapper.find('a').simulate('click')
        expect(wrapper.state().visible).toEqual(true)
    })

    it('should render a copy button', () => {
        expect(wrapper.find(CopyButton).length).toEqual(1)
    })
})
