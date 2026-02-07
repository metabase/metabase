import cx from "classnames";
import { Component } from "react";
import { t } from "ttag";

import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { assignUserColors } from "metabase/lib/formatting";
import * as Urls from "metabase/lib/urls";
import type { User } from "metabase-types/api";

import { Revision } from "./Revision";

interface SegmentType {
  table_id: number;
  name: string;
}

interface RevisionType {
  id: number;
  user: User;
}

interface RevisionHistoryProps {
  segment?: SegmentType;
  revisions?: RevisionType[];
  user: User;
}

export class RevisionHistory extends Component<RevisionHistoryProps> {
  render() {
    const { segment, revisions, user } = this.props;

    let userColorAssignments: Record<number, string> = {};
    if (revisions) {
      userColorAssignments = assignUserColors(
        revisions.map((r) => r.user.id),
        user.id,
      );
    }

    return (
      <LoadingAndErrorWrapper
        loading={!segment || !revisions}
        className={cx(CS.wrapper, CS.scrollY, CS.bgWhite)}
      >
        {() => (
          <>
            <Breadcrumbs
              className={CS.py4}
              crumbs={[
                [
                  t`Segments`,
                  Urls.dataModelSegments({ tableId: segment!.table_id }),
                ],
                [t`Segment History`],
              ]}
            />
            <div
              className={cx(CS.wrapper, CS.py4)}
              style={{ maxWidth: 950 }}
              data-testid="segment-revisions"
            >
              <h2 className={CS.mb4}>
                {t`Revision History for`} &quot;{segment!.name}&quot;
              </h2>
              <ol>
                {revisions!.map((revision) => (
                  <Revision
                    key={revision.id}
                    revision={revision as any}
                    tableId={segment!.table_id}
                    objectName={segment!.name}
                    currentUser={user}
                    userColor={userColorAssignments[revision.user.id]}
                  />
                ))}
              </ol>
            </div>
          </>
        )}
      </LoadingAndErrorWrapper>
    );
  }
}
