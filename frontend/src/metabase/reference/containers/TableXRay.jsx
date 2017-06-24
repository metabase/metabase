/* @flow */
import React, { Component } from 'react'

import { connect } from 'react-redux'

import type { Field } from 'metabase/meta/types/Field'
import { fetchTableFingerPrint } from 'metabase/reference/reference'

type Props = {
    fetchTableFingerPrint: () => void,
    fingerprint: {}
}

class TableXRay extends Component {
    props: Props

    componentDidMount () {
        this.props.fetchTableFingerPrint(this.props.params.tableId)
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
                        <pre>
                            <code>
                                { JSON.stringify(this.props.fingerprint, null, 2) }
                            </code>
                        </pre>
                    </div>
                </div>
            </div>
        )
    }
}

const mapStateToProps = state => ({
    fingerprint: state.reference.tableFingerprint,
})

const mapDispatchToProps = {
    fetchTableFingerPrint: fetchTableFingerPrint
}

export default connect(mapStateToProps, mapDispatchToProps)(TableXRay)
