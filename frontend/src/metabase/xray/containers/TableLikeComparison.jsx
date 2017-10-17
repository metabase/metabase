import React, { Component } from 'react'
import { connect } from 'react-redux'
import _ from 'underscore'

import { initialize } from 'metabase/xray/xray'
import {
    getComparison,
    getComparisonFields,
    getComparisonContributors,
    getModelItem,
    getLoadingStatus,
    getError
} from 'metabase/xray/selectors'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import XRayComparison from 'metabase/xray/components/XRayComparison'
import LoadingAnimation from 'metabase/xray/components/LoadingAnimation'

import { hasComparison, comparisonLoadingMessages } from 'metabase/xray/utils'

const mapStateToProps = (state) => ({
    comparison:     getComparison(state),
    fields:         getComparisonFields(state),
    contributors:   getComparisonContributors(state),
    itemA:          getModelItem(state, 0),
    itemB:          getModelItem(state, 1),
    isLoading:      getLoadingStatus(state),
    error:          getError(state)
})

const mapDispatchToProps = {
    initialize
}


@connect(mapStateToProps, mapDispatchToProps)
class TableLikeComparison extends Component {

    componentWillMount () {
        this.props.initialize()
        this.props.fetchTableLikeComparison()
    }

    componentWillUnmount() {
        // HACK Atte Keinänen 9/20/17: We need this for now because the structure of `state.xray.xray` isn't same
        // for all xray types and if switching to different kind of xray (= rendering different React container)
        // without resetting the state fails because `state.xray.xray` subproperty lookups fail
        this.props.initialize();
    }

    render () {
        const {
            comparison,
            contributors,
            error,
            fields,
            isLoading,
            itemA,
            itemB,
            cost
        } = this.props

        return (
            <LoadingAndErrorWrapper
                loading={isLoading || !hasComparison(comparison)}
                error={error}
                noBackground
                loadingMessages={comparisonLoadingMessages}
                loadingScenes={[<LoadingAnimation />]}
            >
                { () =>

                    <XRayComparison
                        cost={cost}
                        fields={_.sortBy(fields, 'distance').reverse()}
                        comparisonFields={[
                            'Difference',
                            'Entropy',
                            'Histogram',
                            'Nil%',
                        ]}
                        contributors={contributors}
                        comparables={comparison.comparables}
                        comparison={comparison.comparison}
                        itemA={itemA}
                        itemB={itemB}
                    />
                }
            </LoadingAndErrorWrapper>
        )
    }
}

export default TableLikeComparison
