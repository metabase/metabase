import cx from "classnames";
import dayjs from "dayjs";
import { t } from "ttag";

import { UserAvatar } from "metabase/common/components/UserAvatar";
import CS from "metabase/css/core/index.css";
import type {
  RevisionDiffKey,
  Revision as RevisionType,
  TableId,
  User,
} from "metabase-types/api";
import {
  isCardOrDashboardRevisionDiff,
  isCardOrDashboardRevisionDiffKey,
  isDiffKey,
  isSegmentRevisionDiff,
  isSegmentRevisionDiffKey,
} from "metabase-types/guards";

import { RevisionDiff } from "./RevisionDiff";

interface Props {
  currentUser: User;
  objectName: string;
  revision: RevisionType;
  tableId: TableId;
  userColor?: string;
}

export function Revision({
  objectName,
  revision,
  currentUser,
  tableId,
  userColor,
}: Props) {
  const { message, diffKeys } = getDiff(revision);

  return (
    <li className={cx(CS.flex, CS.flexRow)}>
      <div className={cx(CS.flex, CS.flexColumn, CS.alignCenter, CS.mr2)}>
        <div className={CS.textWhite}>
          <UserAvatar user={revision.user} bg={userColor} />
        </div>

        <div
          className={cx(CS.flexFull, CS.my1, CS.borderLeft)}
          style={{ borderWidth: 2 }}
        />
      </div>
      <div className={cx(CS.flex1, CS.mt1, CS.mb4)}>
        <div className={cx(CS.flex, CS.mb1, CS.textMedium)}>
          <span>
            <strong>
              {revision.user.id === currentUser.id
                ? t`You`
                : revision.user.common_name}
            </strong>{" "}
            {getAction(revision, objectName)}
          </span>
          <span className={cx(CS.flexAlignRight, CS.h5)}>
            {dayjs(revision.timestamp).format("MMMM DD, YYYY")}
          </span>
        </div>

        {message && <p>&quot;{message}&quot;</p>}

        {diffKeys.map((key) => {
          const segmentDiff =
            isSegmentRevisionDiff(revision.diff) &&
            isSegmentRevisionDiffKey(key)
              ? revision.diff[key]
              : undefined;
          const cardOrDashboardDiff =
            isCardOrDashboardRevisionDiff(revision.diff) &&
            isCardOrDashboardRevisionDiffKey(key)
              ? revision.diff[key]
              : undefined;

          return (
            <RevisionDiff
              diff={segmentDiff ?? cardOrDashboardDiff ?? {}}
              key={key}
              property={key}
              tableId={tableId}
            />
          );
        })}
      </div>
    </li>
  );
}

function getDiff(revision: RevisionType): {
  message: string | null;
  diffKeys: RevisionDiffKey[];
} {
  const diffKeys = Object.keys(revision.diff ?? {}).filter(isDiffKey);

  if (revision.is_creation) {
    const segmentRevisionDiff =
      revision.diff && "description" in revision.diff ? revision.diff : null;

    return {
      message:
        segmentRevisionDiff?.description?.after != null
          ? String(segmentRevisionDiff.description.after)
          : revision.message,
      diffKeys: diffKeys.filter(
        (key) => key !== "name" && key !== "description",
      ),
    };
  }

  return {
    message: revision.message,
    diffKeys,
  };
}

function getAction(revision: RevisionType, objectName: string): string {
  if (revision.is_creation) {
    const nameAfter =
      revision.diff && "name" in revision.diff && revision.diff.name?.after;
    return t`created` + ' "' + String(nameAfter ?? "") + '"';
  }

  if (revision.is_reversion) {
    return t`reverted to a previous version`;
  }

  const changedKeys = Object.keys(revision.diff || {});

  if (changedKeys.length === 1) {
    switch (changedKeys[0]) {
      case "name":
        return t`edited the title`;
      case "description":
        return t`edited the description`;
      case "definition":
        return t`edited the ` + objectName;
    }
  }

  return t`made some changes`;
}
