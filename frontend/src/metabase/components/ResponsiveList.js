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
        items: Array,
        cardDisplay: Function,
        onClick: Function
    }

    constructor() {
        super()
    }

    render () {
        const { items, cardDisplay, onClick } = this.props
        return (
            <ol className={cardStyle}>
                { items.map((item, index) => {
                    let card
                    if(cardDisplay) {
                        card = cardDisplay(item)
                    } else {
                        card = (
                            <Surface>
                                <div className={cxs({ padding: '2em' })}>
                                    <CardTitle>{item.name}</CardTitle>
                                    <Text>{item.description}</Text>
                                </div>
                            </Surface>
                        )
                    }
                    return (
                        <li
                            key={index}
                            className={cxs({ padding: '1em', flex: '0 50%' })}
                            onClick={() => onClick(item) }
                        >
                            { card }
                        </li>
                    )
                })}
            </ol>
        )
    }
}

export default ResponsiveList
