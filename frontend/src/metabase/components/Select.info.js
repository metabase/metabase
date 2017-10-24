import React from 'react'
import insightful from 'insightful'

import Select, { Option } from 'metabase/components/Select'

export const component = Select

// Create a big list of garbage so that we know our virtualization is working
// we also need to have them be objects, so return an object with a name property
const fixture = insightful(200000).map(i => ({ name: i }))

export const showCode = false

export const description = `
    A component used to make a selection
`

export const examples = {
    'Default': (
        <Select onChange={() => alert('Selected')}>
            { fixture.map(f => <Option name={f.name}>{f.name}</Option>)}
        </Select>
    ),
    'With search': (
        <Select
            isInitiallyOpen
            searchProp='name'
            searchCaseInsensitive
            onChange={() => alert('Selected')}
        >
            { fixture.map(f => <Option name={f.name}>{f.name}</Option>)}
        </Select>
    ),
}

