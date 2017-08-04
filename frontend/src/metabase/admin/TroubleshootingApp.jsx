import React, { Component } from 'react'
import { connect } from 'react-redux'
import moment from "moment";

import { getTroubleshootingInfo } from 'metabase/admin/admin'

import LoadingAndErrorWrapper from 'metabase/components/LoadingAndErrorWrapper'


const roughSizeOfObject = ( object ) => {

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

const getUTCOffset = () => {
    return moment().format("Z")
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
            <div className="wrapper">
                <div className="my4">
                    <h2>Helpful Troubleshooting Information</h2>
                </div>
                
                <LoadingAndErrorWrapper loading={!this.props.troubleShootingInfo}>
                            { () => 
                                <div> 
                                    <div className="my3">
                                        <h3 className="mb2 text-grey-4 text-uppercase">Global Timezones</h3>
                                        <ul className="bordered rounded p3">
                                            <li className="mb1 h4">Server Timezone : <b>{this.props.troubleShootingInfo.server_timezone}</b> </li>
                                            <li className="mb1 h4">Reporting Timezone : <b>{this.props.troubleShootingInfo.reporting_timezone}</b> </li>
                                            <li className="mb1 h4">Browser UTC Offset : <b>{getUTCOffset()}</b> </li>
                                        </ul>
                                    </div>
    
                                    <div className="my3">
                                        <h3 className="text-grey-4 text-uppercase" >Database Timezones</h3>
                                         <table className="ContentTable">
                                            <thead>
                                                <tr>
                                                    <th>Name</th>
                                                    <th>Timezone</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                            {this.props.troubleShootingInfo.databases.map((database)=>
                                                <tr> 
                                                    <td> <a href={"/admin/databases/"+ database.id}>{database.name}</a> </td>
                                                    <td> {database.tz}</td>
                                                </tr>
                                            )}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="my3">
                                        <h3 className="mb2 text-grey-4 text-uppercase">Client Info</h3>
                                        <ul className="bordered rounded p3">
                                            <li className="mb1 h4"> Metadata Cache Size (bytes) : <b>{this.props.reduxStoreSize}</b> </li>
                                        </ul>
                                    </div>
                                </div> 
                            }
                </LoadingAndErrorWrapper>
            </div>
         )
    }
}

export default connect(mapStateToProps, mapDispatchToProps)(TroubleshootingApp)