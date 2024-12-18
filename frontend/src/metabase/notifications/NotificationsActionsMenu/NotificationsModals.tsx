import type {
  DashboardNotificationsModalType,
  QuestionNotificationsModalType,
} from "metabase/notifications/NotificationsActionsMenu/types";
import { AlertListModal } from "metabase/notifications/modals/AlertListModal/AlertListModal";
import type Question from "metabase-lib/v1/Question";
import type { Dashboard } from "metabase-types/api";

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
  dashboard,
}: NotificationsModalsProps) => {
  if (modalType === "question-alert") {
    return (
      <AlertListModal
        notificationType="alert"
        question={question}
        onClose={onClose}
      />
    );
  }

  if (modalType === "question-subscription") {
    return (
      <AlertListModal
        notificationType="subscription"
        question={question}
        onClose={onClose}
      />
    );
  }

  if (modalType === "dashboard-subscription") {
    dashboard;
    // TODO: add dashboard subscription modal component
    return null;
  }

  return null;
};
