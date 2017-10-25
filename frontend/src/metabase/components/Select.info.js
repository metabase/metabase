import React from 'react'

import Select, { Option } from 'metabase/components/Select'

export const component = Select

const fixture = [
    { name: 'Blue' },
    { name: 'Green' },
    { name: 'Red' },
    { name: 'Yellow' },
]

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
            searchProp='name'
            onChange={() => alert('Selected')}
        >
            { fixture.map(f => <Option name={f.name}>{f.name}</Option>)}
        </Select>
    ),
}

