/* @flow */
import React, { Component } from 'react'

import { connect } from 'react-redux'
import title from 'metabase/hoc/Title'

import { fetchTableFingerPrint } from 'metabase/reference/reference'

import {
    getTableConstituents,
    getTableFingerprint
} from 'metabase/reference/selectors'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'
import SimpleHistogram from 'metabase/xray/SimpleHistogram'

type Props = {
    constituents: [],
    fetchTableFingerPrint: () => void,
    fingerprint: {},
    params: {
        tableId: number
    }
}

const mapStateToProps = state => ({
    fingerprint: getTableFingerprint(state),
    constituents: getTableConstituents(state)
})

const mapDispatchToProps = {
    fetchTableFingerPrint
}

@connect(mapStateToProps, mapDispatchToProps)
@title(() => "Table")
class TableXRay extends Component {
    props: Props

    state = {
        grid: true
    }

    componentDidMount () {
        this.props.fetchTableFingerPrint(this.props.params.tableId)
    }


    render () {
        const { constituents } = this.props

        return (
            <div className="wrapper" style={{ marginLeft: '6em', marginRight: '6em'}}>
                <div className="my4 py4">
                    <h1>Xray</h1>
                </div>
                    <LoadingAndErrorWrapper loading={!constituents}>
                        { () =>
                            <ol>
                                { constituents.map(c => {
                                    console.log(c)
                                    return (
                                        <li>
                                            <div className="full">
                                                {c.field.display_name}
                                                <SimpleHistogram
                                                    data={c.histogram}
                                                />
                                            </div>
                                        </li>
                                    )
                                })}
                            </ol>
                        }
                    </LoadingAndErrorWrapper>
            </div>
        )
    }
}

export default TableXRay
