import React from 'react'
import { shallow } from 'enzyme'
import sinon from 'sinon'
import NewUserOnboardingModal from './NewUserOnboardingModal'

describe('new user onboarding modal', () => {
    describe('advance steps', () => {
        it('should advance through steps properly', () => {
            const wrapper = shallow(
                <NewUserOnboardingModal />
            )
            const nextButton = wrapper.find('a')

            expect(wrapper.state().step).toEqual(1)
            nextButton.simulate('click')
            expect(wrapper.state().step).toEqual(2)
        })

        it('should close if on the last step', () => {
            const onClose = sinon.spy()
            const wrapper = shallow(
                <NewUserOnboardingModal onClose={onClose} />
            )
            // go to the last step
            wrapper.setState({ step: 3 })

            const nextButton = wrapper.find('a')
            expect(nextButton.text()).toEqual('Let\'s go')
            nextButton.simulate('click')
            expect(onClose.called).toEqual(true)
        })
    })
})
