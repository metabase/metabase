import PropTypes from "prop-types";
import type { MouseEventHandler } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

import { getUser } from "metabase/selectors/user";
import type { NamedUser } from "metabase/lib/user";
import { getFullName } from "metabase/lib/user";
import { TextButton } from "metabase/components/Button.styled";
import { Tooltip } from "metabase/ui";
import DateTime from "metabase/components/DateTime";
import type { CollectionItem, User } from "metabase-types/api";

dayjs.extend(relativeTime);

function mapStateToProps(state: any, props: any) {
  return {
    ...props,
    user: getUser(state),
  };
}

LastEditInfoLabel.propTypes = {
  item: PropTypes.shape({
    "last-edit-info": PropTypes.shape({
      id: PropTypes.number,
      email: PropTypes.string,
      first_name: PropTypes.string,
      last_name: PropTypes.string,
      timestamp: PropTypes.string,
    }).isRequired,
  }),
  prefix: PropTypes.string,
  user: PropTypes.shape({
    id: PropTypes.number,
  }).isRequired,
  onClick: PropTypes.func,
  className: PropTypes.string,
};

function formatEditorName(lastEditInfo: NamedUser) {
  const name = getFullName(lastEditInfo);
  return name || lastEditInfo.email;
}

export type CollectionItemWithLastEditedInfo = CollectionItem & {
  "last-edit-info": {
    id?: number;
    timestamp: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
  };
};

const defaultLabelFormatter = (
  nameOfLastEditor: string | null | undefined,
  howLongAgo: string,
) => (
  <>
    {nameOfLastEditor ? t`Edited ${howLongAgo} by ${nameOfLastEditor}` : null}
  </>
);

function LastEditInfoLabel({
  item,
  user,
  onClick,
  className,
  fullName = null,
  formatLabel = defaultLabelFormatter,
}: {
  item: CollectionItemWithLastEditedInfo;
  user: User;
  onClick: MouseEventHandler<HTMLButtonElement>;
  className: string;
  fullName: string | null;
  formatLabel: (
    nameOfLastEditor: string | null | undefined,
    howLongAgo: string,
  ) => JSX.Element;
}) {
  const lastEditInfo = item["last-edit-info"];
  const editorId = lastEditInfo?.id;
  const timestamp = lastEditInfo?.timestamp;

  const date = dayjs(timestamp);
  const timeLabel =
    timestamp && date.isValid() ? date.fromNow() : t`(invalid date)`;

  fullName ||= formatEditorName(lastEditInfo) || null;
  const editorFullName = editorId === user.id ? t`you` : fullName;
  const label = formatLabel(editorFullName, timeLabel);

  return label ? (
    <Tooltip
      label={timestamp ? <DateTime value={timestamp} /> : null}
      disabled={!timeLabel}
    >
      <TextButton
        size="small"
        className={className}
        onClick={onClick}
        data-testid="revision-history-button"
      >
        {label}
      </TextButton>
    </Tooltip>
  ) : null;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(LastEditInfoLabel);
