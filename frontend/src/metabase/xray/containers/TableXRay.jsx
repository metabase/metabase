/* @flow */
import React, { Component } from 'react'

import { connect } from 'react-redux'
import title from 'metabase/hoc/Title'

import {
    fetchTableFingerPrint,
    changeCost
} from 'metabase/reference/reference'

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
            <div className="wrapper" style={{ marginLeft: '6em', marginRight: '6em'}}>
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
                    <LoadingAndErrorWrapper loading={!constituents}>
                        { () =>
                            <ol>
                                { constituents.map(c => {
                                    console.log(c)
                                    return (
                                        <li>
                                            <div className="full">
                                                <Link to={`xray/field/${c.field.id}`}>
                                                    {c.field.display_name}
                                                </Link>
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
