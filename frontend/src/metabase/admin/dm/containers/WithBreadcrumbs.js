/* @flow */
import React, { Component } from 'react'

import BreadcrumbNav from './BreadcrumbNav'
import SearchResults from './SearchResults'
import Icon from 'metabase/components/Icon'

type State = {
    searchString: string
}

class DatabaseSearch extends Component {
    state: State = {
        searchString: ''
    }

    onSearch = (searchString) => {
        this.setState({ searchString })
    }

    render () {
        return (
            <div
                className="bordered rounded border-dark relative flex align-center rounded"
                style={{ width: 300 }}
            >
                <Icon name="search" />
                <input
                    type="text"
                    style={{ outline: 'none' }}
                    className="borderless full p2"
                    placeholder="Search for metrics, tables, or fields"
                    onChange={event => this.onSearch(event.currentTarget.value)}
                />
                { this.state.searchString && (
                    <div className="absolute z2 left right" style={{ top: 40 }}>
                        <SearchResults searchString={this.state.searchString} />
                    </div>
                )}
            </div>
        )
    }
}


const withBreadcrumbs = (Component, showSearch = true, ExtraNav) => class extends Component {
    render () {
        return (
            <div>
                <div className="border-bottom py2">
                    <div className="wrapper flex align-center">
                        <BreadcrumbNav />
                        <div className="ml-auto">
                            { showSearch && <DatabaseSearch /> }
                            { ExtraNav && <ExtraNav /> }
                        </div>
                    </div>
                </div>
                <div className="wrapper">
                    <Component {...this.props} />
                </div>
            </div>
        )
    }
}

export default withBreadcrumbs
