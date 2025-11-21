import { type Ref, forwardRef } from "react";

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

export const PublicLinkModals = ({
  modalType,
  onClose,
  question,
  dashboard,
}: SharingModalProps) => {
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

  return null;
};
