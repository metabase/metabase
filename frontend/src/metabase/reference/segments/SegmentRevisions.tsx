import cx from "classnames";
import { getIn } from "icepick";
import { Component } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { modelIconMap } from "metabase/common/utils/icon";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/redux";
import S from "metabase/reference/components/List/List.module.css";
import { Revision } from "metabase/segments";
import { assignUserColors } from "metabase/ui/colors/formatting-colors";
import type {
  Revision as RevisionData,
  Segment,
  Table,
  User,
} from "metabase-types/api";

import ReferenceHeader from "../components/ReferenceHeader";
import type { ReferenceRouteProps, StateWithReference } from "../selectors";
import { getSegmentRevisions, getUser } from "../selectors";
import type { ReferenceLoadingProps } from "../types";

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
    user: getUser(state),
  };
};

interface SegmentRevisionsProps {
  style: React.CSSProperties;
  revisions: Record<string, RevisionData>;
  segment: Segment | undefined;
  table: Table | undefined;
  user: User;
  loading?: boolean;
  loadingError?: unknown;
}

class SegmentRevisions extends Component<SegmentRevisionsProps> {
  render() {
    const { style, revisions, segment, table, user, loading, loadingError } =
      this.props;

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
          name={t`Revision history for ${segment?.name}`}
          headerIcon={modelIconMap.segment}
        />
        <LoadingAndErrorWrapper
          loading={!loadingError && loading}
          error={loadingError}
        >
          {() =>
            Object.keys(revisions).length > 0 && table != null ? (
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
                            tableId={table.id}
                            objectName={segment?.name ?? ""}
                            currentUser={user || {}}
                            userColor={
                              userColorAssignments[
                                // Unjustified type cast. FIXME
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
  // Unjustified type cast. FIXME
)(
  // `connect` cannot match its inferred props against this component's own
  // props, because the `actions` spread in `mapDispatchToProps` is untyped.
  // The cast restores the props a caller actually passes.
  SegmentRevisions as unknown as React.ComponentType<
    ReferenceRouteProps &
      ReferenceLoadingProps & {
        segment: Segment | undefined;
        table: Table | undefined;
      }
  >,
);
