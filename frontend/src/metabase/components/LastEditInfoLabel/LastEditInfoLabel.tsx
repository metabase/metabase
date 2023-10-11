// LastEditInfoLabel.propTypes = {
import moment from "moment-timezone";
import { t } from "ttag";
import type { User } from "metabase-types/api";
import { TextButton } from "metabase/components/Button.styled";
import DateTime from "metabase/components/DateTime";
import Tooltip from "metabase/core/components/Tooltip";
import { useSelector } from "metabase/lib/redux";
import { getFullName } from "metabase/lib/user";
import { getUser } from "metabase/selectors/user";
//   item: PropTypes.shape({
//     "last-edit-info": PropTypes.shape({
//       id: PropTypes.number.isRequired,
//       email: PropTypes.string.isRequired,
//       first_name: PropTypes.string,
//       last_name: PropTypes.string,
//       timestamp: PropTypes.string.isRequired,
//     }).isRequired,
//   }),
//   user: PropTypes.shape({
//     id: PropTypes.number,
//   }).isRequired,
//   onClick: PropTypes.func,
//   className: PropTypes.string,
// };

type LastEditInfoType = Pick<
  User,
  "id" | "email" | "first_name" | "last_name"
> & { timestamp: string };

type LastEditInfoLabelProps = {
  item: {
    "last-edit-info": LastEditInfoType;
  };
  onClick?: () => void;
  className?: string;
};

function formatEditorName(lastEditInfo: LastEditInfoType) {
  const name = getFullName(lastEditInfo);

  return name || lastEditInfo.email;
}

export const LastEditInfoLabel = ({
  item,
  onClick,
  className,
}: LastEditInfoLabelProps) => {
  const user = useSelector(getUser);

  const lastEditInfo = item["last-edit-info"];
  const { id: editorId, timestamp } = lastEditInfo;
  const time = moment(timestamp).fromNow();

  const editor =
    user && editorId === user.id ? t`you` : formatEditorName(lastEditInfo);

  return (
    <Tooltip tooltip={<DateTime value={timestamp} />}>
      <TextButton
        size="small"
        className={className}
        onClick={onClick}
        data-testid="revision-history-button"
      >{t`Edited ${time} by ${editor}`}</TextButton>
    </Tooltip>
  );
};
