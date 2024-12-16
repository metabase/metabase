import { type Ref, forwardRef } from "react";

import { AlertListModal } from "metabase/notifications/modals/AlertListModal/AlertListModal";
import type {
  DashboardNotificationsModalType,
  QuestionNotificationsModalType,
} from "metabase/notifications/types";
import { Box } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Dashboard } from "metabase-types/api";

const MenuTarget = forwardRef(function _MenuTarget(
  _props,
  ref: Ref<HTMLDivElement>,
) {
  return <Box h="2rem" ref={ref} />;
});

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
    return (
      <AlertListModal
        question={question}
        target={<MenuTarget />}
        onClose={onClose}
      />
    );
  }

  if (modalType === "question-subscription") {
    return (
      <AlertListModal
        question={question}
        target={<MenuTarget />}
        onClose={onClose}
      />
    );
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
