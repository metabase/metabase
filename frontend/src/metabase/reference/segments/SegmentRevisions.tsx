import cx from "classnames";
import { getIn } from "icepick";
import { Component } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import S from "metabase/common/components/List/List.module.css";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { modelIconMap } from "metabase/common/utils/icon";
import CS from "metabase/css/core/index.css";
import { Revision } from "metabase/querying/segments/components/revisions/Revision";
import { connect } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import { getShallowTables as getTables } from "metabase/selectors/metadata";
import { assignUserColors } from "metabase/ui/colors/formatting-colors";
import type {
  NormalizedTable,
  Revision as RevisionData,
  User,
} from "metabase-types/api";

import ReferenceHeader from "../components/ReferenceHeader";
import type { ReferenceRouteProps, StateWithReference } from "../selectors";
import {
  getError,
  getLoading,
  getSegment,
  getSegmentRevisions,
  getUser,
} from "../selectors";
import type { StubbedSegment } from "../types";

const emptyStateData = {
  get message() {
    return t`There are no revisions for this segment`;
  },
};

const mapStateToProps = (
  state: StateWithReference,
  props: ReferenceRouteProps,
) => {
  return {
    revisions: getSegmentRevisions(state, props),
    segment: getSegment(state, props),
    tables: getTables(state),
    user: getUser(state),
    loading: getLoading(state),
    loadingError: getError(state),
  };
};

const mapDispatchToProps = {
  ...metadataActions,
};

interface SegmentRevisionsProps {
  style: React.CSSProperties;
  revisions: Record<string, RevisionData>;
  segment: StubbedSegment;
  tables: Record<string, NormalizedTable>;
  user: User;
  loading?: boolean;
  loadingError?: unknown;
}

class SegmentRevisions extends Component<SegmentRevisionsProps> {
  render() {
    const { style, revisions, segment, tables, user, loading, loadingError } =
      this.props;

    const entity = segment;

    const userColorAssignments: Record<string | number, string> =
      user && Object.keys(revisions).length > 0
        ? assignUserColors(
            Object.values(revisions).map((revision) =>
              String(getIn(revision, ["user", "id"])),
            ),
            String(user.id),
          )
        : {};

    return (
      <div style={style} className={CS.full} data-testid="segment-revisions">
        <ReferenceHeader
          name={t`Revision history for ${this.props.segment.name}`}
          headerIcon={modelIconMap.segment}
        />
        <LoadingAndErrorWrapper
          loading={!loadingError && loading}
          error={loadingError}
        >
          {() =>
            Object.keys(revisions).length > 0 &&
            entity.table_id != null &&
            tables[entity.table_id] ? (
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
                      .map((revision) =>
                        revision && revision.diff ? (
                          <Revision
                            key={revision.id}
                            revision={revision || {}}
                            tableId={entity.table_id!}
                            objectName={entity.name!}
                            currentUser={user || {}}
                            userColor={
                              userColorAssignments[
                                getIn(revision, ["user", "id"]) as string
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(SegmentRevisions as unknown as React.ComponentType);
