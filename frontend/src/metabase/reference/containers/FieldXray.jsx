/* @flow */
import React, { Component } from 'react'
import Visualization from 'metabase/visualizations/components/Visualization'

import { connect } from 'react-redux'

import type { Field } from 'metabase/meta/types/Field'

type Props = {
    fetchXrayData: () => void,
    field: Field,
    xray: {}
}

class FieldXray extends Component {
    props: Props

    componentWillMount() {
        this.props.fetchXrayData(this.props.field.id)
    }
    render () {
        return (
            <div style={{
                maxWidth: 550,
                marginLeft: 'calc(48px + 1rem)',
            }}>
                <h3>XRAY</h3>
                <div className="Grid Grid--1of2 Grid--gutters mt1">
                    <div className="Grid-cell">
                        <div className="bordered rounded shadowed py2">
                            <Visualization
                                series={[this.props.xray.min]}
                            />
                        </div>
                    </div>
                    <div className="Grid-cell">
                        <div className="bordered rounded shadowed py2">
                            <Visualization
                                series={[this.props.xray.max]}
                            />
                        </div>
                    </div>
                </div>
                <Visualization
                    series={[this.props.xray.histogram]}
                />
            </div>
        )
    }
}

const mapStateToProps = state => ({
    xray: {
        min: {
            card: {
                name: 'Min',
                display: 'scalar'
            },
            data: {
                cols: [{
                    base_type: "type/Integer",
                    description: null,
                    display_name: "count",
                    extra_info: {},
                    id: null,
                    name: "count",
                    source: "aggregation",
                    special_type: "type/Number",
                    table_id: null,
                    target: null
                }],
                columns: [["count"]],
                rows: [
                    [Math.floor(Math.random() * 40)]
                ]
            }
        },
        max: {
            card: {
                name: 'Max',
                display: 'scalar'
            },
            data: {
                cols: [{
                    base_type: "type/Integer",
                    description: null,
                    display_name: "count",
                    extra_info: {},
                    id: null,
                    name: "count",
                    source: "aggregation",
                    special_type: "type/Number",
                    table_id: null,
                    target: null
                }],
                columns: [["count"]],
                rows: [
                    [Math.floor(Math.random() * 400)]
                ]
            }
        },
        histogram: {
            card: {
                name: 'Histogram',
                display: 'bar',
            },
            data: {
                cols: [
                    {
                        base_type: "type/Integer",
                        description: null,
                        display_name: "ID",
                        extra_info: {},
                        id: 4,
                        name: "ID",
                        source: "breakout",
                        special_type: "type/Number",
                        table_id: null,
                        target: null
                    },
                    {
                        base_type: "type/Integer",
                        description: null,
                        display_name: "count",
                        extra_info: {},
                        id: null,
                        name: "count",
                        source: "aggregation",
                        special_type: "type/Number",
                        table_id: 1,
                        target: null
                    },
                ],
                columns: [["ID", "count"]],
                rows: makeFakeBarRows()
            }
        }
    }
})

function makeFakeBarRows () {
    let rows = []
    for(let i = 1; i < 50; i ++) {
        rows.push([
            i,
            Math.floor(Math.random() * 100)
        ])
    }
    return rows
}

const fetchXrayData = () => ({
    'type': 'metabase/XRAY'
})

export default connect(mapStateToProps, { fetchXrayData })(FieldXray)
