import React, { Component } from 'react'
import { connect } from 'react-redux'

import { fetchCardComparison } from 'metabase/reference/reference'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'

const mapStateToProps = state => ({
    cardComparison: state.reference.cardComparison
})

const mapDispatchToProps = {
    fetchCardComparison
}

class CardComparison extends Component {
    componentWillMount () {
        const { cardId1, cardId2 } = this.props.params
        console.log('ids', cardId1, cardId2)
        this.props.fetchCardComparison(cardId1, cardId2)
    }
    render () {
        return (
            <LoadingAndErrorWrapper loading={!this.props.cardComparison}>
                { JSON.stringify(this.props.cardComparison, null, 2) }
            </LoadingAndErrorWrapper>
        )
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(CardComparison)
