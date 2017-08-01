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

import SimpleStat from 'metabase/xray/SimpleStat'

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
@title(({ fingerprint }) => fingerprint && fingerprint.table.display_name || "Table")
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
        const { constituents, fingerprint, params } = this.props

        return (
            <LoadingAndErrorWrapper loading={!constituents} className="bg-slate-extra-light">
                { () =>
                    <div className="wrapper" style={{ paddingLeft: '12em', paddingRight: '12em'}}>
                        <div className="my4 flex align-center py2">
                            <h1>{ fingerprint.table.display_name }</h1>
                            <div className="ml-auto">
                                Fidelity:
                                <CostSelect
                                    currentCost={params.cost}
                                    onChange={this.changeCost}
                                />
                            </div>
                        </div>
                        <div>
                            <ol>
                                { constituents.map(c => {
                                    return (
                                        <li className="Grid my3 bg-white bordered rounded shadowed">
                                            <div className="Grid-cell Cell--1of3 border-right">
                                                <div className="p4">
                                                    <Link
                                                        to={`xray/field/${c.field.id}/approximate`}
                                                        className="text-brand-hover link transition-text"
                                                    >
                                                        <h2 className="text-bold">{c.field.display_name}</h2>
                                                    </Link>
                                                    <p className="text-measure text-paragraph">{c.field.description}</p>

                                                    <div className="flex align-center">
                                                        { c.min && (
                                                            <SimpleStat
                                                                stat={c.min}
                                                            />
                                                        )}
                                                        { c.max && (
                                                            <SimpleStat
                                                                stat={c.max}
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="Grid-cell p3">
                                                <div style={{ height: 220 }}>
                                                    <Histogram histogram={c.histogram.value} />
                                                </div>
                                            </div>
                                        </li>
                                    )
                                })}
                            </ol>
                        </div>
                    </div>
                }
            </LoadingAndErrorWrapper>
        )
    }
}

export default TableXRay
