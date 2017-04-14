import cxs from 'cxs'
import React, { Component } from 'react'

import Text from 'metabase/components/Text'
import Surface from 'metabase/components/Surface'

import Icon from 'metabase/components/Icon'

import { normal } from 'metabase/lib/colors'

const cardStyle = cxs({
    display: 'flex',
    flex: '0 50%',
    flexWrap: 'wrap'
})

const listStyle = cxs({
    background: '#fff',
    border: '1px solid #DCE1E4',
    borderRadius: 4,
})

const CardTitle =({ children }) =>
    <h2 className={cxs({ color: normal.blue })}>
        { children }
    </h2>

const determineListStyle = (listLength) =>
    listLength > 6 ? listStyle : cardStyle

const ListSearch = ({ onSearch, value }) =>
    <div className="border-bottom">
        <input
            className="borderless p2 h3 full"
            placeholder="Search for a table"
            value={value}
            type="text"
            onChange={(ev) => onSearch(ev.target.value)}
            autoFocus
        />
    </div>


class ResponsiveList extends Component {

    props = {
        // an array of items to display
        items: Array,

        // a custom card display function, your function will be provided the raw item
        // and you are expected to return a valid React element
        cardDisplay: Function,

        // a custom list item  display function, your function will be provided the raw item
        // and you are expected to return a valid React element
        listDisplay: Function,

        // the function to call when a user clicks on an item in the list
        onClick: Function,

        // a custom search function, your function will be provided the search string
        // typed by the user
        search: Function
    }

    state = {
        search: ''
    }

    filterFunction = (item) => {
        const search = this.state.search.toLowerCase()
        return item.name.toLowerCase().includes(search)
    }

    render () {
        const { items, cardDisplay, onClick } = this.props
        return (
            <ol className={determineListStyle(items.length)}>
                { items.length > 6 && (
                    <li>
                        <ListSearch
                            onSearch={search => this.setState({ search })}
                            value={this.state.search}
                        />
                    </li>
                )}
                { items.filter(item =>
                        item.name.toLowerCase().includes(this.state.search.toLowerCase()
                        ))
                        .map((item, index) => {
                    if(items.length < 6) {
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
                    } else {
                        return (
                            <li
                                key={index}
                                className={cxs({ padding: '2em' })}
                                onClick={() => onClick(item) }
                            >
                                <CardTitle>{item.name}</CardTitle>
                                <Text>{item.diescription}</Text>
                            </li>
                        )
                    }
                })}
            </ol>
        )
    }
}

export default ResponsiveList
