import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "c-3po";
import { getIn } from "icepick";

import S from "metabase/components/List.css";
import R from "metabase/reference/Reference.css";

import * as metadataActions from "metabase/redux/metadata";
import { assignUserColors } from "metabase/lib/formatting";

import {
  getSegmentRevisions,
  getMetric,
  getSegment,
  getTables,
  getUser,
  getLoading,
  getError,
} from "../selectors";

import Revision from "metabase/admin/datamodel/components/revisions/Revision.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import EmptyState from "metabase/components/EmptyState.jsx";
import ReferenceHeader from "../components/ReferenceHeader.jsx";

const emptyStateData = {
  message: t`There are no revisions for this segment`,
};

const mapStateToProps = (state, props) => {
  return {
    revisions: getSegmentRevisions(state, props),
    metric: getMetric(state, props),
    segment: getSegment(state, props),
    tables: getTables(state, props),
    user: getUser(state, props),
    loading: getLoading(state, props),
    loadingError: getError(state, props),
  };
};

const mapDispatchToProps = {
  ...metadataActions,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class SegmentRevisions extends Component {
  static propTypes = {
    style: PropTypes.object.isRequired,
    revisions: PropTypes.object.isRequired,
    metric: PropTypes.object.isRequired,
    segment: PropTypes.object.isRequired,
    tables: PropTypes.object.isRequired,
    user: PropTypes.object.isRequired,
    loading: PropTypes.bool,
    loadingError: PropTypes.object,
  };

  render() {
    const {
      style,
      revisions,
      metric,
      segment,
      tables,
      user,
      loading,
      loadingError,
    } = this.props;

    const entity = metric.id ? metric : segment;

    const userColorAssignments =
      user && Object.keys(revisions).length > 0
        ? assignUserColors(
            Object.values(revisions).map(revision =>
              getIn(revision, ["user", "id"]),
            ),
            user.id,
          )
        : {};

    return (
      <div style={style} className="full">
        <ReferenceHeader
          name={t`Revision history for ${this.props.segment.name}`}
          headerIcon="segment"
        />
        <LoadingAndErrorWrapper
          loading={!loadingError && loading}
          error={loadingError}
        >
          {() =>
            Object.keys(revisions).length > 0 && tables[entity.table_id] ? (
              <div className="wrapper wrapper--trim">
                <div className={R.revisionsWrapper}>
                  {Object.values(revisions)
                    .map(
                      revision =>
                        revision && revision.diff ? (
                          <Revision
                            key={revision.id}
                            revision={revision || {}}
                            tableMetadata={tables[entity.table_id] || {}}
                            objectName={entity.name}
                            currentUser={user || {}}
                            userColor={
                              userColorAssignments[
                                getIn(revision, ["user", "id"])
                              ]
                            }
                          />
                        ) : null,
                    )
                    .reverse()}
                </div>
              </div>
            ) : (
              <div className={S.empty}>
                <EmptyState {...emptyStateData} />
              </div>
            )
          }
        </LoadingAndErrorWrapper>
      </div>
    );
  }
}
