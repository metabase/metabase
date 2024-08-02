import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import Modal from "metabase/components/Modal";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getQuestionAlerts } from "metabase/query_builder/selectors";
import { getUser } from "metabase/selectors/user";
import { Icon } from "metabase/ui";
import type { Alert } from "metabase-types/api";

import { CreateAlertModalContent } from "../AlertModals";

import { AlertListItem } from "./AlertListItem";

type AlertListPopoverContentProps = {
  setMenuFreeze: (freeze: boolean) => void;
  closeMenu: () => void;
};

export const AlertListPopoverContent = ({
  setMenuFreeze,
  closeMenu,
}: AlertListPopoverContentProps) => {
  const questionAlerts = useSelector(getQuestionAlerts);
  const user = useSelector(getUser);

  const [adding, setAdding] = useState(false);
  const [hasJustUnsubscribedFromOwnAlert, setHasJustUnsubscribedFromOwnAlert] =
    useState(false);

  const onAdd = () => {
    setMenuFreeze(true);
    setAdding(true);
  };

  const onEndAdding = (shouldCloseMenu = false) => {
    setMenuFreeze(false);
    setAdding(false);
    if (shouldCloseMenu) {
      closeMenu();
    }
  };

  const isCreatedByCurrentUser = (alert: Alert) => {
    return user ? alert.creator.id === user.id : false;
  };

  const onUnsubscribe = (alert: Alert) => {
    if (isCreatedByCurrentUser(alert)) {
      setHasJustUnsubscribedFromOwnAlert(true);
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
    <div style={{ minWidth: 410 }}>
      <ul>
        {Object.values(sortedQuestionAlerts).map(alert => (
          <AlertListItem
            key={alert.id}
            alert={alert}
            setMenuFreeze={setMenuFreeze}
            closeMenu={closeMenu}
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
            onClick={onAdd}
          >
            <Icon name="add" style={{ marginLeft: 9, marginRight: 17 }} />{" "}
            {t`Set up your own alert`}
          </a>
        </div>
      )}
      {adding && (
        <Modal full onClose={onEndAdding}>
          <CreateAlertModalContent
            onCancel={onEndAdding}
            onAlertCreated={() => onEndAdding(true)}
          />
        </Modal>
      )}
    </div>
  );
};
