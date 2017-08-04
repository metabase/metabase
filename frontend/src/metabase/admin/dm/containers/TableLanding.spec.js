import React from 'react'
import { shallow, mount } from 'enzyme'
import sinon from 'sinon'

import { TableLanding } from './TableLanding'

describe('TableLanding', () => {

    it('should start out in non edit mode', () => {
        const wrapper = shallow(<TableLanding />)
        expect(wrapper.state().editing).toEqual(false)
    })

    it('should call fetch table metadata', () => {
        const fetchSpy = sinon.spy()
        const wrapper = mount(
            <TableLanding
                params={{ tableId: 4 }}
                fetchTableMetadata={fetchSpy}
            />
        )

        expect(fetchSpy.called).toEqual(true)
        expect(fetchSpy.calledWith(4)).toEqual(true)
    })

})
