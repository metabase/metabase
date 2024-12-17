import { AlertListModal } from "metabase/notifications/modals/AlertListModal/AlertListModal";
import type {
  DashboardNotificationsModalType,
  QuestionNotificationsModalType,
} from "metabase/notifications/types";
import type Question from "metabase-lib/v1/Question";
import type { Dashboard } from "metabase-types/api";

type BaseSharingModalProps = {
  onClose: () => void;
};

type SharingModalProps = BaseSharingModalProps &
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

export const SharingModals = ({
  modalType,
  onClose,
  question,
  // dashboard,
}: SharingModalProps) => {
  if (modalType === "question-alert") {
    return <AlertListModal question={question} onClose={onClose} />;
  }

  if (modalType === "question-subscription") {
    return <AlertListModal question={question} onClose={onClose} />;
  }

  // TODO: add Dashboard modal

  // if (modalType === "dashboard-public-link") {
  //   return (
  //     <DashboardPublicLinkPopover
  //       dashboard={dashboard}
  //       target={<MenuTarget />}
  //       onClose={onClose}
  //       isOpen
  //     />
  //   );
  // }
  //
  // if (modalType === "dashboard-embed" && dashboard) {
  //   return (
  //     <DashboardSharingEmbeddingModal
  //       key="dashboard-embed"
  //       dashboard={dashboard}
  //       onClose={onClose}
  //       isOpen
  //     />
  //   );
  // }

  return null;
};
