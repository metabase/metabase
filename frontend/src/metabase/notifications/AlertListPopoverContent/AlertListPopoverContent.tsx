import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import { Icon } from "metabase/ui";
import type { Alert } from "metabase-types/api";

import { AlertListItem } from "./AlertListItem";

type AlertListPopoverContentProps = {
  questionAlerts?: Alert[];
  onCreate: () => void;
  onEdit: (alert: Alert) => void;
  onClose: () => void;
};

export const AlertListPopoverContent = ({
  questionAlerts,
  onCreate,
  onEdit,
  onClose,
}: AlertListPopoverContentProps) => {
  const user = useSelector(getUser);

  const [hasJustUnsubscribedFromOwnAlert, setHasJustUnsubscribedFromOwnAlert] =
    useState(false);

  if (!questionAlerts) {
    return null;
  }

  const isCreatedByCurrentUser = (alert: Alert) => {
    return user ? alert.creator.id === user.id : false;
  };

  const onUnsubscribe = (alert: Alert) => {
    if (isCreatedByCurrentUser(alert)) {
      setHasJustUnsubscribedFromOwnAlert(true);
    }

    const alertCount = Object.keys(questionAlerts).length;

    // if we have just unsubscribed from the last alert, close the popover
    if (alertCount <= 1) {
      onClose();
    }
  };

  const isNonAdmin = !user?.is_superuser;

  const [ownAlerts, othersAlerts] = _.partition(
    questionAlerts,
    isCreatedByCurrentUser,
  );

  // user's own alert should be shown first if it exists
  const sortedQuestionAlerts = [...ownAlerts, ...othersAlerts];
  const hasOwnAlerts = ownAlerts.length > 0;
  const hasOwnAndOthers = hasOwnAlerts && othersAlerts.length > 0;

  return (
    <div style={{ minWidth: 410 }} data-testid="alert-list-popover">
      <ul>
        {Object.values(sortedQuestionAlerts).map(alert => (
          <AlertListItem
            key={alert.id}
            alert={alert}
            onEdit={() => onEdit(alert)}
            highlight={
              isNonAdmin && hasOwnAndOthers && isCreatedByCurrentUser(alert)
            }
            onUnsubscribe={onUnsubscribe}
          />
        ))}
      </ul>
      {(!hasOwnAlerts || hasJustUnsubscribedFromOwnAlert) && (
        <div className={cx(CS.borderTop, CS.p2, CS.bgLightBlue)}>
          <a
            className={cx(
              CS.link,
              CS.flex,
              CS.alignCenter,
              CS.textBold,
              CS.textSmall,
            )}
            onClick={onCreate}
          >
            <Icon name="add" style={{ marginLeft: 9, marginRight: 17 }} />{" "}
            {t`Set up your own alert`}
          </a>
        </div>
      )}
    </div>
  );
};
