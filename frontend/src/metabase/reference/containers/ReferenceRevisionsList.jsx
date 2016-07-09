import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import S from "metabase/components/List.css";

import * as metadataActions from "metabase/redux/metadata";

import { getSection, getData, getLoading, getError } from "../selectors";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

const mapStateToProps = (state, props) => {
    return {
        section: getSection(state),
        revisions: getData(state),
        loading: getLoading(state),
        error: getError(state)
    }
}

const mapDispatchToProps = {
    ...metadataActions
};

@connect(mapStateToProps, mapDispatchToProps)
export default class RevisionHistoryApp extends Component {
    static propTypes = {
        section: PropTypes.object.isRequired,
        revisions: PropTypes.object.isRequired,
        loading: PropTypes.bool,
        error: PropTypes.object
    };

    render() {
        const {
            revisions,
            section,
            error,
            loading
        } = this.props;

        return (
            <div className="full">
                <div className="wrapper wrapper--trim">
                    <div className={S.header}>
                        {section.name}
                    </div>
                </div>
                <LoadingAndErrorWrapper loading={!error && loading} error={error}>
                </LoadingAndErrorWrapper>
            </div>
        );
    }
}
