import { DashboardSharingEmbeddingModal } from "metabase/dashboard/containers/DashboardSharingEmbeddingModal";
import { QuestionEmbedWidget } from "metabase/query_builder/components/QuestionEmbedWidget";
import type Question from "metabase-lib/v1/Question";
import type { Dashboard } from "metabase-types/api";

import {
  QuestionPublicLinkPopover,
  DashboardPublicLinkPopover,
} from "../PublicLinkPopover";

type BaseSharingModalProps = {
  onClose: () => void;
};

type SharingModalProps = BaseSharingModalProps &
  (
    | {
        modalType: "question-public-link" | null;
        question: Question;
        dashboard?: never;
      }
    | {
        modalType: "dashboard-public-link" | null;
        dashboard: Dashboard;
        question?: never;
      }
    | {
        modalType: "question-embed" | null;
        question: Question;
        dashboard?: never;
      }
    | {
        modalType: "dashboard-embed" | null;
        dashboard: Dashboard;
        question?: never;
      }
  );

export const SharingModals = ({
  modalType,
  onClose,
  question,
  dashboard,
}: SharingModalProps) => {
  if (modalType === "question-public-link") {
    return (
      <QuestionPublicLinkPopover
        question={question}
        target={<span />}
        onClose={onClose}
        isOpen
      />
    );
  }

  if (modalType === "dashboard-public-link") {
    return (
      <DashboardPublicLinkPopover
        dashboard={dashboard}
        target={<span />}
        onClose={onClose}
        isOpen
      />
    );
  }

  if (modalType === "question-embed" && question) {
    return <QuestionEmbedWidget card={question._card} onClose={onClose} />;
  }

  if (modalType === "dashboard-embed" && dashboard) {
    return (
      <DashboardSharingEmbeddingModal
        key="dashboard-embed"
        dashboard={dashboard}
        onClose={onClose}
        isOpen
      />
    );
  }

  return null;
};
