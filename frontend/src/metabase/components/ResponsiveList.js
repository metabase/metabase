import cxs from 'cxs'
import React, { Component } from 'react'

import Text from 'metabase/components/Text'
import Surface from 'metabase/components/Surface'

import { normal } from 'metabase/lib/colors'

const cardStyle = cxs({
    display: 'flex',
    flex: '0 50%',
    flexWrap: 'wrap'
})

const CardTitle =({ children }) =>
    <h2 className={cxs({ color: normal.blue })}>
        { children }
    </h2>

class ResponsiveList extends Component {

    props = {
        items: Array
    }

    render () {
        const { items } = this.props
        return (
            <ol className={cardStyle}>
                { items.map(item => {
                    return (
                        <li className={cxs({ padding: '1em', flex: '0 50%' })}>
                            <Surface>
                                <div className={cxs({ padding: '2em' })}>
                                    <CardTitle>{item.name}</CardTitle>
                                    <Text>{item.description}</Text>
                                </div>
                            </Surface>
                        </li>
                    )
                })}
            </ol>
        )
    }
}

export default ResponsiveList
