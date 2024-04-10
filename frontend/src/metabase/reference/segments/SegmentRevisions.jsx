import cx from "classnames";
import { getIn } from "icepick";
import PropTypes from "prop-types";
import { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import Revision from "metabase/admin/datamodel/components/revisions/Revision";
import EmptyState from "metabase/components/EmptyState";
import S from "metabase/components/List/List.module.css";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { assignUserColors } from "metabase/lib/formatting";
import * as metadataActions from "metabase/redux/metadata";

import ReferenceHeader from "../components/ReferenceHeader";
import {
  getSegmentRevisions,
  getMetric,
  getSegment,
  getTables,
  getUser,
  getLoading,
  getError,
} from "../selectors";

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

class SegmentRevisions extends Component {
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
      <div style={style} className={CS.full}>
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
              <div className={CS.wrapper}>
                <div
                  className={cx(
                    CS.px3,
                    CS.py3,
                    CS.mb4,
                    CS.bgWhite,
                    CS.bordered,
                  )}
                >
                  <div>
                    {Object.values(revisions)
                      .map(revision =>
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

export default connect(mapStateToProps, mapDispatchToProps)(SegmentRevisions);
