import React, { Component } from 'react'
import { connect } from 'react-redux'

import { getTroubleshootingInfo } from 'metabase/admin/admin'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'


function roughSizeOfObject( object ) {

    var objectList = [];
    var stack = [ object ];
    var bytes = 0;

    while ( stack.length ) {
        var value = stack.pop();

        if ( typeof value === 'boolean' ) {
            bytes += 4;
        }
        else if ( typeof value === 'string' ) {
            bytes += value.length * 2;
        }
        else if ( typeof value === 'number' ) {
            bytes += 8;
        }
        else if
        (
            typeof value === 'object'
            && objectList.indexOf( value ) === -1
        )
        {
            objectList.push( value );

            for( var i in value ) {
                stack.push( value[ i ] );
            }
        }
    }
    return bytes;
}

const mapStateToProps = state => ({
    troubleShootingInfo: state.admin.troubleshooting,
    reduxStoreSize: roughSizeOfObject(state)
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

                        <h2>Client Info</h2>
                        <p> Metadata Cache Size (bytes) : {this.props.reduxStoreSize} </p>
                    </div>
                }
            </LoadingAndErrorWrapper>
        )
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(TroubleshootingApp)