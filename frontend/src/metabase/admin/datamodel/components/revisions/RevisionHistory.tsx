import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { assignUserColors } from "metabase/lib/formatting";
import * as Urls from "metabase/lib/urls";
import type { User } from "metabase-types/api";
import type { Revision } from "metabase-types/api/revision";
import type { Segment } from "metabase-types/api/segment";

import { Revision as RevisionComponent } from "./Revision";

interface Props {
  revisions?: Revision[] | null;
  segment?: Segment;
  user: User;
}

export function RevisionHistory({ revisions, segment, user }: Props) {
  const userColorAssignments = useMemo(() => {
    if (!revisions) {
      return {};
    }

    return assignUserColors(
      revisions.map((revision) => String(revision.user.id)),
      String(user.id),
    );
  }, [revisions, user]);

  return (
    <LoadingAndErrorWrapper
      loading={!segment || !revisions}
      className={cx(CS.wrapper, CS.scrollY, CS.bgWhite)}
    >
      {() => {
        if (!segment || !revisions) {
          return null;
        }

        return (
          <>
            <Breadcrumbs
              className={CS.py4}
              crumbs={[
                [
                  t`Segments`,
                  Urls.dataModelSegments({ tableId: segment.table_id }),
                ],
                [t`Segment History`],
              ]}
            />
            <div
              className={cx(CS.wrapper, CS.py4)}
              data-testid="segment-revisions"
              style={{ maxWidth: 950 }}
            >
              <h2 className={CS.mb4}>
                {t`Revision History for`} &quot;{segment.name}&quot;
              </h2>
              <ol>
                {revisions.map((revision) => (
                  <RevisionComponent
                    key={revision.id}
                    currentUser={user}
                    objectName={segment.name}
                    revision={revision}
                    tableId={segment.table_id}
                    userColor={userColorAssignments[revision.user.id]}
                  />
                ))}
              </ol>
            </div>
          </>
        );
      }}
    </LoadingAndErrorWrapper>
  );
}
