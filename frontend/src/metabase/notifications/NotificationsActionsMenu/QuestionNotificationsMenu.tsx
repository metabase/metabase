import { useState } from "react";
import { t } from "ttag";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { QuestionAlertsMenuItem } from "metabase/notifications/NotificationsActionsMenu/QuestionAlertsMenuItem";
import type { QuestionNotificationsModalType } from "metabase/notifications/NotificationsActionsMenu/types";
import { setUIControls } from "metabase/query_builder/actions";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { canManageSubscriptions as canManageSubscriptionsSelector } from "metabase/selectors/user";
import { Flex } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import {
  NotificationsMenu,
  NotificationsMenuTriggerButton,
} from "./NotificationsMenu";
import { NotificationsModals } from "./NotificationsModals";

export function QuestionNotificationsMenu({
  question,
}: {
  question: Question;
}) {
  const dispatch = useDispatch();
  const [modalType, setModalType] =
    useState<QuestionNotificationsModalType | null>(null);
  const isModel = question.type() === "model";
  const isArchived = question.isArchived();
  const collection = question.collection();
  const isAnalytics = collection && isInstanceAnalyticsCollection(collection);
  const canManageSubscriptions = useSelector(canManageSubscriptionsSelector);

  const canShowAlerts = question.canRun() && canManageSubscriptions;

  if (isModel || isArchived || isAnalytics || !canShowAlerts) {
    return null;
  }

  if (!question.isSaved()) {
    const openSaveQuestionModal = () => {
      dispatch(
        setUIControls({ modal: MODAL_TYPES.SAVE_QUESTION_BEFORE_EMBED }),
      );
    };

    return (
      <NotificationsMenuTriggerButton
        tooltip={t`You must save this question before creating an alert`}
        onClick={openSaveQuestionModal}
      />
    );
  }

  return (
    <Flex>
      <NotificationsMenu>
        <QuestionAlertsMenuItem
          question={question}
          onClick={() => setModalType("question-alert")}
        />
      </NotificationsMenu>
      <NotificationsModals
        modalType={modalType}
        question={question}
        onClose={() => setModalType(null)}
      />
    </Flex>
  );
}
