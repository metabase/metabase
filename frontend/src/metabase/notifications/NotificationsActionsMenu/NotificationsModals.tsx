import { type Ref, forwardRef } from "react";

import { AlertPopover } from "metabase/notifications/AlertListPopoverContent/AlertPopover";
import type {
  DashboardNotificationsModalType,
  QuestionNotificationsModalType,
} from "metabase/notifications/NotificationsActionsMenu/types";
import { Box } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Dashboard } from "metabase-types/api";

const MenuTarget = forwardRef(function _MenuTarget(
  _props,
  ref: Ref<HTMLDivElement>,
) {
  return <Box h="2rem" ml="-0.5rem" ref={ref} />;
});

type BaseNotificationsModalsProps = {
  onClose: () => void;
};

type NotificationsModalsProps = BaseNotificationsModalsProps &
  (
    | {
        modalType: QuestionNotificationsModalType;
        question: Question;
        dashboard?: never;
      }
    | {
        modalType: DashboardNotificationsModalType;
        dashboard: Dashboard;
        question?: never;
      }
    | {
        modalType: null;
        question?: Question;
        dashboard?: Dashboard;
      }
  );

export const NotificationsModals = ({
  modalType,
  onClose,
  question,
}: NotificationsModalsProps) => {
  if (modalType === "question-alert") {
    return (
      <AlertPopover
        question={question}
        target={<MenuTarget />}
        onClose={onClose}
      />
    );
  }

  return null;
};
