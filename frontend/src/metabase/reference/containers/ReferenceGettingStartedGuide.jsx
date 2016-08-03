/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { connect } from 'react-redux';
import { reduxForm } from "redux-form";

import S from "metabase/reference/Reference.css";

import EditHeader from "metabase/reference/components/EditHeader.jsx";
import GuideEmptyState from "metabase/reference/components/GuideEmptyState.jsx"
import GuideHeader from "metabase/reference/components/GuideHeader.jsx"

import * as actions from 'metabase/reference/reference';

import {
    getUser,
    getIsEditing
} from '../selectors';

import {
    isGuideEmpty
} from '../utils';

const mapStateToProps = (state, props) => ({
    guide: {
        things_to_know: "test",
        contact: { name: null, email: null },
        most_important_dashboard: null,
        important_metrics: [],
        important_tables: [],
        important_segments: []
    },
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
            guide,
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
                { guide && (isGuideEmpty(guide) ?
                    <GuideEmptyState 
                        isSuperuser={user && user.is_superuser}
                        startEditing={startEditing} 
                    /> :
                    <div className="full">
                        <GuideHeader startEditing={startEditing} />
                        <GuideDetail name={} description={} value={} link={} linkClass={} />
                    </div>)
                }
            </form>
        );
    }
}