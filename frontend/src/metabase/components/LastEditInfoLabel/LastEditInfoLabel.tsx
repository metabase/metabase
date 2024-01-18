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

export const getHowLongAgo = (timestamp: string) => {
  const date = dayjs(timestamp);
  const howLongAgo =
    timestamp && date.isValid() ? date.fromNow() : t`(invalid date)`;
  return howLongAgo;
};

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

export type CollectionItemWithLastEditInfo = CollectionItem & {
  "last-edit-info": {
    id?: number;
    timestamp: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
  };
};

function LastEditInfoLabel({
  item,
  user,
  onClick,
  className,
  fullName = null,
  children,
}: {
  item: CollectionItemWithLastEditInfo;
  user: User;
  onClick: MouseEventHandler<HTMLButtonElement>;
  className: string;
  fullName: string | null;
  children?: React.ReactNode;
}) {
  const lastEditInfo = item["last-edit-info"];
  const editorId = lastEditInfo?.id;
  const timestamp = lastEditInfo?.timestamp;
  const timeLabel = getHowLongAgo(timestamp);

  fullName ||= formatEditorName(lastEditInfo) || null;
  const editorFullName = editorId === user.id ? t`you` : fullName;

  return children ? (
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
        {children || (
          <>
            {editorFullName
              ? t`Edited ${timeLabel} by ${editorFullName}`
              : null}
          </>
        )}
      </TextButton>
    </Tooltip>
  ) : null;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(LastEditInfoLabel);
