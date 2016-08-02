/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { connect } from 'react-redux';

import S from "metabase/reference/Reference.css";

import GuideEmptyState from "metabase/reference/components/GuideEmptyState.jsx"

import * as actions from 'metabase/reference/reference';

import {
    getUser,
    getIsEditing
} from '../selectors';

const mapStateToProps = (state, props) => ({
    user: getUser(state),
    isEditing: getIsEditing(state)
});

const mapDispatchToProps = {
    ...actions
};

@connect(mapStateToProps, mapDispatchToProps)
export default class ReferenceGettingStartedGuide extends Component {
    static propTypes = {
        isEditing: PropTypes.bool
    };

    render() {
        const {
            user,
            isEditing,
            startEditing
        } = this.props;

        return (
            <GuideEmptyState 
                isSuperuser={user && user.is_superuser}
                startEditing={startEditing} 
            />
        );
    }
}