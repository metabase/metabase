import cx from "classnames";
import { t } from "ttag";

import { Breadcrumbs } from "metabase/common/components/Breadcrumbs";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { Revision } from "metabase/segments";
import * as Urls from "metabase/urls";
import type {
  Revision as RevisionType,
  Segment,
  User,
} from "metabase-types/api";

interface Props {
  revisions?: RevisionType[] | null;
  segment?: Segment;
  user: User;
}

export function RevisionHistory({ revisions, segment, user }: Props) {
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
                  <Revision
                    key={revision.id}
                    currentUser={user}
                    objectName={segment.name}
                    revision={revision}
                    tableId={segment.table_id}
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
