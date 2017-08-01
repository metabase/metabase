/* @flow */
import React, { Component } from 'react'

import { connect } from 'react-redux'
import title from 'metabase/hoc/Title'

import {
    fetchTableFingerPrint,
    changeCost
} from 'metabase/reference/reference'

import Histogram from 'metabase/xray/Histogram'

import COSTS from 'metabase/xray/costs'
import CostSelect from 'metabase/xray/components/CostSelect'

import { Link } from 'react-router'

import {
    getTableConstituents,
    getTableFingerprint
} from 'metabase/reference/selectors'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'

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
    fetchTableFingerPrint,
    changeCost
}

@connect(mapStateToProps, mapDispatchToProps)
@title(() => "Table")
class TableXRay extends Component {
    props: Props

    state = {
        grid: true
    }

    componentDidMount () {
        this.fetchTableFingerPrint()
    }

    fetchTableFingerPrint () {
        const { params } = this.props
        const cost = COSTS[params.cost]
        this.props.fetchTableFingerPrint(params.tableId, cost)
    }

    componentDidUpdate (prevProps) {
        if(prevProps.params.cost !== this.props.params.cost) {
            this.fetchTableFingerPrint()
        }
    }

    changeCost = ({ target }) => {
        const { params } = this.props
        // TODO - this feels kinda icky, would be nice to be able to just pass cost
        console.log(params)
        this.props.changeCost(`table/${params.tableId}/${target.value}`)
    }

    render () {
        const { constituents, params } = this.props

        return (
            <LoadingAndErrorWrapper loading={!constituents}>
                { () =>
                    <div className="wrapper" style={{ paddingLeft: '6em', paddingRight: '6em'}}>
                        <div className="my4 flex align-center py4">
                            <h1>Xray</h1>
                            <div className="ml-auto">
                                Fidelity:
                                <CostSelect
                                    currentCost={params.cost}
                                    onChange={this.changeCost}
                                />
                            </div>
                        </div>
                        <ol className="Grid Grid--1of3">
                            { constituents.map(c => {
                                return (
                                    <li className="Grid-cell">
                                        <div className="full">
                                            <Link to={`xray/field/${c.field.id}/approximate`}>
                                                {c.field.display_name}
                                                <div  style={{ height: 120 }}>
                                                    <Histogram histogram={c.histogram} />
                                                </div>
                                            </Link>
                                        </div>
                                    </li>
                                )
                            })}
                        </ol>
                    </div>
                }
            </LoadingAndErrorWrapper>
        )
    }
}

export default TableXRay
