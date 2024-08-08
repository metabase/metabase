import cx from "classnames";
import { useState, useRef } from "react";
import { t } from "ttag";

import { useListCardAlertsQuery, skipToken } from "metabase/api";
import Popover from "metabase/components/Popover";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { canManageSubscriptions as _canManageSubscriptions } from "metabase/selectors/user";
import { Icon } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";

import { AlertListPopoverContent } from "../../AlertListPopoverContent";

import { AlertIcon } from "./QuestionAlertWidget.styled";

export function QuestionAlertWidget({
  question,
  className,
  onCreateAlert,
}: {
  question: Question;
  className?: string;
  onCreateAlert: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  // this isFrozen nonsense is due to AlertListPopoverContent containing a <Modal>
  const [isFrozen, setIsFrozen] = useState(false);

  const { data: questionAlerts } = useListCardAlertsQuery({
    id: question.id() ?? skipToken,
  });

  const canManageSubscriptions = useSelector(_canManageSubscriptions);

  const handleClose = () => {
    setIsOpen(false);
    setIsFrozen(false);
  };

  const handleOpen = () => {
    setIsOpen(true);
    setIsFrozen(false);
  };

  const handleFreeze = () => {
    setIsFrozen(true);
  };

  const rootRef = useRef<HTMLSpanElement>(null);

  if (!canManageSubscriptions) {
    return null;
  }

  if (question.isSaved() && questionAlerts?.length) {
    return (
      <span onClick={handleOpen} ref={rootRef}>
        <Icon
          name="bell"
          className={cx(className, CS.textBrand, CS.cursorPointer)}
        />
        <Popover
          target={rootRef.current}
          isOpen={isOpen}
          className={isFrozen ? CS.hide : null}
          onClose={handleClose}
        >
          <AlertListPopoverContent
            setMenuFreeze={handleFreeze}
            closeMenu={handleClose}
          />
        </Popover>
      </span>
    );
  }

  return (
    <AlertIcon
      name="bell"
      tooltip={t`Get alerts`}
      size={20}
      className={className}
      onClick={onCreateAlert}
    />
  );
}

QuestionAlertWidget.shouldRender = ({
  question,
  visualizationSettings,
}: {
  question: Question;
  visualizationSettings: VisualizationSettings;
}) =>
  question.alertType(visualizationSettings) !== null &&
  !question.isArchived() &&
  question.type() !== "model";
