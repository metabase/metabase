import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import i from "icepick";

import S from "metabase/components/List.css";

import * as metadataActions from "metabase/redux/metadata";
import { assignUserColors } from "metabase/lib/formatting";

import {
    getSection,
    getData,
    getMetric,
    getList,
    getTables,
    getUser,
    getLoading,
    getError
} from "../selectors";

import Revision from "metabase/admin/datamodel/components/revisions/Revision.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import EmptyState from "metabase/components/EmptyState.jsx";

const mapStateToProps = (state, props) => {
    return {
        section: getSection(state),
        revisions: getData(state),
        metric: getMetric(state),
        list: getList(state),
        tables: getTables(state),
        user: getUser(state),
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
        style: PropTypes.object.isRequired,
        section: PropTypes.object.isRequired,
        revisions: PropTypes.object.isRequired,
        metric: PropTypes.object.isRequired,
        list: PropTypes.object.isRequired,
        tables: PropTypes.object.isRequired,
        user: PropTypes.object.isRequired,
        loading: PropTypes.bool,
        error: PropTypes.object
    };

    render() {
        const {
            style,
            section,
            revisions,
            metric,
            list,
            tables,
            user,
            loading,
            error
        } = this.props;

        const entity = metric.id ? metric : list;

        const empty = {
            icon: 'mine',
            message: 'You haven\'t added any databases yet.'
        };

        const userColorAssignments = user && Object.keys(revisions).length > 0 ?
            assignUserColors(
                Object.values(revisions)
                    .map(revision => i.getIn(revision, ['user', 'id'])),
                user.id
            ) : {};

        return (
            <div style={style} className="full">
                <div className="wrapper wrapper--trim">
                    <div className={S.header}>
                        <div className={S.leftIcons}>

                        </div>
                        {section.name}
                    </div>
                </div>
                <LoadingAndErrorWrapper loading={!error && loading} error={error}>
                    { () => Object.keys(revisions).length > 0 && tables[entity.table_id] ?
                        <div className="wrapper wrapper--trim">
                            {Object.values(revisions)
                                .map(revision => revision && revision.diff ?
                                    <Revision
                                        key={revision.id}
                                        revision={revision || {}}
                                        tableMetadata={tables[entity.table_id] || {}}
                                        objectName={entity.name}
                                        currentUser={user || {}}
                                        userColor={userColorAssignments[i.getIn(revision, ['user', 'id'])]}
                                    /> :
                                    null)
                                .reverse()
                            }
                        </div>
                        :
                        <div className={S.empty}>
                          <EmptyState message={empty.message} icon={empty.icon} />
                        </div>
                    }
                </LoadingAndErrorWrapper>
            </div>
        );
    }
}
