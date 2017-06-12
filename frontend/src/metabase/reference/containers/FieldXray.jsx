/* @flow */
import React, { Component } from 'react'
import Visualization from 'metabase/visualizations/components/Visualization'

import { connect } from 'react-redux'

import type { Field } from 'metabase/meta/types/Field'
import { fetchFieldFingerPrint } from 'metabase/reference/reference'

type Props = {
    fetchFieldFingerPrint: () => void,
    field: Field,
    fingerprint: {}
}

class FieldXray extends Component {
    props: Props

    componentDidMount () {
        this.props.fetchFieldFingerPrint(this.props.field.id)
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
                            { this.props.max && this.props.max }
                            Max
                            { /*
                            <Visualization
                                series={[this.props.xray.min]}
                            />
                            */}
                        </div>
                    </div>
                    <div className="Grid-cell">
                        <div className="bordered rounded shadowed py2">
                            { this.props.min && this.props.min }
                            Min
                            { /*
                            <Visualization
                                series={[this.props.xray.max]}
                            />
                           */}
                        </div>
                    </div>
                </div>
            </div>
        )
    }
}

// TODO - create selectors
const mapStateToProps = state => ({
    min: state.reference.fingerprint && state.reference.fingerprint.min,
    max: state.reference.finterprint && state.reference.fingerprint.max,
    histogram: state.reference.fingerprint && state.reference.fingerprint.histogram
})

export default connect(mapStateToProps, { fetchFieldFingerPrint })(FieldXray)
