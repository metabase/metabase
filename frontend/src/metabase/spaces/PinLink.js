import React from 'react'
import { connect } from 'react-redux'

import { getCurrentSpace } from './selectors'

const mapStateToProps = (state) => {
    return {
        space: getCurrentSpace(state)
    }
}

@connect(mapStateToProps)
export class PinLink extends React.Component {
    pinItem = () => {
        // const { dispatch, item, itemType } = this.props
    }
    render () {
        return (
            <a onClick={this.pinItem()}>PIN</a>
        )
    }
}

