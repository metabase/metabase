/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from 'react';
import ReactDom from 'react-dom';
import { connect } from 'react-redux';

import Sidebar from 'metabase/components/Sidebar.jsx';
import SidebarLayout from 'metabase/components/SidebarLayout.jsx';

import * as metadataActions from 'metabase/redux/metadata';

import {
    getDatabaseId,
    getSectionId,
    getSections,
    getSection,
    getBreadcrumbs
} from '../selectors';

import {
    selectSection as fetchQuestions
} from 'metabase/questions/questions';

const mapStateToProps = (state, props) => ({
    sectionId: getSectionId(state),
    databaseId: getDatabaseId(state),
    sections: getSections(state),
    section: getSection(state),
    breadcrumbs: getBreadcrumbs(state)
});

const mapDispatchToProps = {
    fetchQuestions,
    ...metadataActions
};

@connect(mapStateToProps, mapDispatchToProps)
export default class ReferenceApp extends Component {
    static propTypes = {
        params:         PropTypes.object.isRequired,
        children:       PropTypes.any.isRequired,
        sections:       PropTypes.object.isRequired,
        section:       PropTypes.object.isRequired,
        sectionId:       PropTypes.string.isRequired,
        databaseId:       PropTypes.string
    };

    componentWillMount() {
        if (this.props.section && this.props.section.fetch) {
            const fetchData = this.props[this.props.section.fetch];
            const fetchArgs = this.props.section.fetchArgs || [];
            fetchData(...fetchArgs);
        }
    }

    componentWillReceiveProps(newProps) {
        if (this.props.location.pathname === newProps.location.pathname) {
            return;
        }

        if (newProps.section && newProps.section.fetch) {
            const fetchData = newProps[newProps.section.fetch];
            const fetchArgs = newProps.section.fetchArgs || [];
            fetchData(...fetchArgs);
        }
    }

    render() {
        return (
            <SidebarLayout
                sidebar={<Sidebar {...this.props} />}
            >
                {this.props.children}
            </SidebarLayout>
        )
    }
}
