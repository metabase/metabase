import { type Ref, forwardRef } from "react";

import { DashboardSharingEmbeddingModal } from "metabase/dashboard/containers/DashboardSharingEmbeddingModal";
import { AlertPopover } from "metabase/notifications/AlertListPopoverContent/AlertPopover";
import { QuestionEmbedWidget } from "metabase/query_builder/components/QuestionEmbedWidget";
import { Box } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Dashboard } from "metabase-types/api";

import {
  DashboardPublicLinkPopover,
  QuestionPublicLinkPopover,
} from "../PublicLinkPopover";

import type {
  DashboardSharingModalType,
  QuestionSharingModalType,
} from "./types";

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
        modalType: QuestionSharingModalType;
        question: Question;
        dashboard?: never;
      }
    | {
        modalType: DashboardSharingModalType;
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

  if (modalType === "question-embed" && question) {
    return <QuestionEmbedWidget card={question._card} onClose={onClose} />;
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
