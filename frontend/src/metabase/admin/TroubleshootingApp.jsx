import React, { Component } from 'react'
import { connect } from 'react-redux'

import { getTroubleshootingInfo } from 'metabase/admin/admin'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'

const mapStateToProps = state => ({
    troubleShootingInfo: state.admin.troubleshooting
})

const mapDispatchToProps = {
    getTroubleshootingInfo
}

class TroubleshootingApp extends Component {
    componentWillMount () {
        console.log('Requested state')
        this.props.getTroubleshootingInfo()
    }
    render () {
        return (
            <LoadingAndErrorWrapper loading={!this.props.troubleShootingInfo}>
                { this.props.troubleShootingInfo && 
                    <div>
                        <h1>Helpful Troubleshooting Information</h1>

                        <h2>Global Timezones</h2>
                        <ul>
                            <li>Server Timezone : {this.props.troubleShootingInfo.server_timezone} </li>
                            <li>Reporting Timezone : {this.props.troubleShootingInfo.reporting_timezone} </li>
                        </ul>

                        <h2>Database Timezones</h2>
                        <ul>
                        
                        {this.props.troubleShootingInfo.databases.map((database)=>
                            <li> <a href={"/admin/databases/"+ database.id}>{database.name}</a> Timezone: {database.tz}
                            </li>)
                        }
                        </ul>
                    </div>
                }
            </LoadingAndErrorWrapper>
        )
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(TroubleshootingApp)