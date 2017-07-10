import React from 'react'
import Logs from './Logs'
import { mount } from 'enzyme'
import sinon from 'sinon'

import { UtilApi } from 'metabase/services'

describe('Logs', () => {
    describe('log fetching', () => {
        let timer

        beforeEach(() => {
            timer = sinon.useFakeTimers()
        })

        afterEach(() => {
            timer.restore()
        })

        it('should call UtilApi.logs after 1 second', () => {
            const wrapper = mount(<Logs />)
            const utilSpy = sinon.spy(UtilApi, "logs")

            expect(wrapper.state().logs.length).toEqual(0)
            timer.tick(1001)
            expect(utilSpy.called).toEqual(true)
        })
    })
})
