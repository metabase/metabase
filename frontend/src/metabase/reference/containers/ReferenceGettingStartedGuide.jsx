/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { connect } from 'react-redux';
import { reduxForm } from "redux-form";

import S from "metabase/reference/Reference.css";

import EditHeader from "metabase/reference/components/EditHeader.jsx";
import GuideEmptyState from "metabase/reference/components/GuideEmptyState.jsx"

import * as actions from 'metabase/reference/reference';

import {
    getUser,
    getIsEditing
} from '../selectors';

const mapStateToProps = (state, props) => ({
    guide: {},
    user: getUser(state),
    isEditing: getIsEditing(state)
});

const mapDispatchToProps = {
    ...actions
};

@connect(mapStateToProps, mapDispatchToProps)
@reduxForm({
    form: 'guide',
    fields: []
})
export default class ReferenceGettingStartedGuide extends Component {
    static propTypes = {
        isEditing: PropTypes.bool
    };

    render() {
        const {
            style,
            user,
            isEditing,
            startEditing,
            endEditing,
            handleSubmit,
            submitting
        } = this.props;

        const onSubmit = handleSubmit(async (fields) => 
            console.log(fields)
        );

        return (
            <form className="full" style={style} onSubmit={onSubmit}>
                { isEditing &&
                    <EditHeader
                        endEditing={endEditing}
                        submitting={submitting}
                    />
                }
                <GuideEmptyState 
                    isSuperuser={user && user.is_superuser}
                    startEditing={startEditing} 
                />
            </form>
        );
    }
}