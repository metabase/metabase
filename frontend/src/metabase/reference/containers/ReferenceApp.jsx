/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from 'react';
import ReactDom from 'react-dom';
import { connect } from 'react-redux';

import Sidebar from 'metabase/components/Sidebar.jsx';
import SidebarLayout from 'metabase/components/SidebarLayout.jsx';

import * as metadataActions from 'metabase/redux/metadata';
import * as actions from 'metabase/reference/reference';

import {
    getDatabaseId,
    getSectionId,
    getSections,
    getSection,
    getBreadcrumbs,
    getIsEditing
} from '../selectors';

import {
    selectSection as fetchQuestions
} from 'metabase/questions/questions';

const mapStateToProps = (state, props) => ({
    sectionId: getSectionId(state),
    databaseId: getDatabaseId(state),
    sections: getSections(state),
    section: getSection(state),
    breadcrumbs: getBreadcrumbs(state),
    isEditing: getIsEditing(state)
});

const mapDispatchToProps = {
    fetchQuestions,
    ...metadataActions,
    ...actions
};

@connect(mapStateToProps, mapDispatchToProps)
export default class ReferenceApp extends Component {
    static propTypes = {
        params:         PropTypes.object.isRequired,
        children:       PropTypes.any.isRequired,
        sections:       PropTypes.object.isRequired,
        section:       PropTypes.object.isRequired,
        isEditing: PropTypes.bool
    };

    async componentWillMount() {
        if (this.props.section && this.props.section.fetch) {
            const fetch = this.props.section.fetch;
            this.props.startLoading();
            await Promise.all(Object.keys(fetch).map((fetchPropName) => {
                const fetchData = this.props[fetchPropName];
                const fetchArgs = fetch[fetchPropName] || [];
                return fetchData(...fetchArgs);
            }));
            this.props.endLoading();
        }
    }

    async componentWillReceiveProps(newProps) {
        if (this.props.location.pathname === newProps.location.pathname) {
            return;
        }

        newProps.endEditing();
        newProps.endLoading();

        if (newProps.section && newProps.section.fetch) {
            const fetch = newProps.section.fetch;
            newProps.startLoading();
            await Promise.all(Object.keys(fetch).map((fetchPropName) => {
                const fetchData = newProps[fetchPropName];
                const fetchArgs = fetch[fetchPropName] || [];
                return fetchData(...fetchArgs);
            }));
            newProps.endLoading();
        }
    }

    render() {
        const {
            children,
            sections,
            breadcrumbs,
            isEditing
        } = this.props;
        return (
            <div>
                <SidebarLayout
                    style={ isEditing && { paddingTop: '40px' }}
                    sidebar={<Sidebar sections={sections} breadcrumbs={breadcrumbs} />}
                >
                    {children}
                </SidebarLayout>
            </div>
        )
    }
}
