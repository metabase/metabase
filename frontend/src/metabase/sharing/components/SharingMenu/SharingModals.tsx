import { forwardRef, type Ref } from "react";

import { DashboardSharingEmbeddingModal } from "metabase/dashboard/containers/DashboardSharingEmbeddingModal";
import { AlertPopover } from "metabase/query_builder/components/AlertListPopoverContent/AlertPopover";
import { QuestionEmbedWidget } from "metabase/query_builder/components/QuestionEmbedWidget";
import { Box } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Dashboard } from "metabase-types/api";

import {
  QuestionPublicLinkPopover,
  DashboardPublicLinkPopover,
} from "../PublicLinkPopover";

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
        modalType: "question-alert";
        question: Question;
        dashboard?: never;
      }
    | {
        modalType: "question-public-link";
        question: Question;
        dashboard?: never;
      }
    | {
        modalType: "dashboard-public-link";
        dashboard: Dashboard;
        question?: never;
      }
    | {
        modalType: "question-embed";
        question: Question;
        dashboard?: never;
      }
    | {
        modalType: "dashboard-embed";
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
  dashboard,
}: SharingModalProps) => {
  if (modalType === "question-alert") {
    return (
      <AlertPopover
        question={question}
        target={<MenuTarget />}
        onClose={onClose}
      />
    );
  }

  if (modalType === "question-public-link") {
    return (
      <QuestionPublicLinkPopover
        question={question}
        target={<MenuTarget />}
        onClose={onClose}
        isOpen
      />
    );
  }

  if (modalType === "dashboard-public-link") {
    return (
      <DashboardPublicLinkPopover
        dashboard={dashboard}
        target={<MenuTarget />}
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
