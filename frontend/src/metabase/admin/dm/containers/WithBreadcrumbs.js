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
        searchString: '',
        expanded: false
    }

    onSearch = (searchString) => {
        this.setState({ searchString })
    }

    expand = () => {
        this.setState({ expanded: true })
    }

    handleSearchPress = (event) => {
        if(event.key === "/") this.expand()
    }

    componentDidMount = () => {
        document.addEventListener('keydown', this.handleSearchPress)
    }

    componentWillUnMount = () => {
        document.removeEventListener('keydown', this.handleSearchPress)
    }

    render () {
        return (
            <div
                className="bordered rounded border-dark relative flex align-center rounded"
                style={{
                    width: this.state.expanded ? 300 : 'inherit'
                }}
            >
                <Icon
                    onClick={() => this.expand() }
                    name="search"
                />
                { this.state.expanded && (
                    <div>
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
                )}
            </div>
        )
    }
}


const withBreadcrumbs = (Component, showSearch = true, ExtraNav) => class extends Component {
    displayName = 'WithBreadCrumbs'
    render () {
        return (
            <div>
                <div className="border-bottom py2 flex align-center" style={{ height: 80 }}>
                    <div className="wrapper flex align-center">
                        <BreadcrumbNav />
                        <ol className="ml-auto flex align-center">
                            { showSearch && (
                                <li className="mx2"><DatabaseSearch /></li>
                            )}
                            { ExtraNav && <li><ExtraNav {...this.props} /></li> }
                        </ol>
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
