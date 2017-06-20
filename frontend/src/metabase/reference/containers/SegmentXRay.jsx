/* @flow */
import React, { Component } from 'react'

import { connect } from 'react-redux'

import type { Field } from 'metabase/meta/types/Field'
import { fetchSegmentFingerPrint } from 'metabase/reference/reference'

type Props = {
    fetchSegmentFingerPrint: () => void,
    fingerprint: {}
}

class SegmentXRay extends Component {
    props: Props

    componentDidMount () {
        this.props.fetchSegmentFingerPrint(this.props.params.segmentId)
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
                        <h2>Fingerprint</h2>  
                        <code className="bordered rounded shadowed py2">
                             { JSON.stringify(this.props.fingerprint, null, 2) }
                        </code>

                    </div>
                </div>
            </div>
        )
    }
}

// TODO - create selectors
const mapStateToProps = state => ({
    fingerprint: state.reference.segmentFingerprint, 
})

const mapDispatchToProps = {
    fetchSegmentFingerPrint: fetchSegmentFingerPrint
}


export default connect(mapStateToProps, mapDispatchToProps)(SegmentXRay)
