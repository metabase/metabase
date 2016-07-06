/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from 'react';
import ReactDom from 'react-dom';
import { connect } from 'react-redux';

import Sidebar from 'metabase/components/Sidebar.jsx';
import SidebarLayout from 'metabase/components/SidebarLayout.jsx';

import * as metadataActions from 'metabase/redux/metadata';

import { getDatabaseId, getSectionId, getSections } from '../selectors';

const mapStateToProps = (state, props) => ({
    sectionId: getSectionId(state),
    databaseId: getDatabaseId(state),
    sections: getSections(state)
});

const mapDispatchToProps = {
    ...metadataActions
};

@connect(mapStateToProps, mapDispatchToProps)
export default class ReferenceApp extends Component {
    static propTypes = {
        params:         PropTypes.object.isRequired,
        children:       PropTypes.any.isRequired,
        sections:       PropTypes.object.isRequired,
        sectionId:       PropTypes.string.isRequired,
        databaseId:       PropTypes.string
    };

    componentWillMount() {
        if (this.props.databaseId) {
            return this.props.fetchDatabaseMetadata(this.props.databaseId);
        }

        return this.props.fetchDatabases();
    }

    componentWillReceiveProps(newProps) {
        if (this.props.location.pathname === newProps.location.pathname) {
            return;
        }

        if (this.props.databaseId) {
            return this.props.fetchDatabaseMetadata(this.props.databaseId);
        }

        return this.props.fetchDatabases();
    }

    render() {
        return (
            <SidebarLayout
                sidebar={<Sidebar {...this.props} app="reference" />}
            >
                {this.props.children}
            </SidebarLayout>
        )
    }
}
