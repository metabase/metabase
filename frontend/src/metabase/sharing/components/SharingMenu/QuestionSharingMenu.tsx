import { useState } from "react";
import { t } from "ttag";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import { useSetting } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import {
  canManageSubscriptions as canManageSubscriptionsSelector,
  getUserIsAdmin,
} from "metabase/selectors/user";
import { Flex } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { AlertMenuItem } from "./MenuItems/AlertMenuItem";
import { EmbedMenuItem } from "./MenuItems/EmbedMenuItem";
import { PublicLinkMenuItem } from "./MenuItems/PublicLinkMenuItem";
import { SharingButton, SharingMenu } from "./SharingMenu";
import { SharingModals } from "./SharingModals";
import type { QuestionSharingModalType } from "./types";

export function QuestionSharingMenu({ question }: { question: Question }) {
  const dispatch = useDispatch();
  const [modalType, setModalType] = useState<QuestionSharingModalType | null>(
    null,
  );
  const hasPublicLink = !!question?.publicUUID?.();
  const isModel = question.type() === "model";
  const isArchived = question.isArchived();
  const isPublicSharingEnabled = useSetting("enable-public-sharing");
  const isAdmin = useSelector(getUserIsAdmin);
  const collection = question.collection();
  const isAnalytics = collection && isInstanceAnalyticsCollection(collection);
  const canManageSubscriptions = useSelector(canManageSubscriptionsSelector);

  if (isModel || isArchived || isAnalytics) {
    return null;
  }

  if (!question.isSaved()) {
    const openSaveQuestionModal = () => {
      dispatch(
        setUIControls({ modal: MODAL_TYPES.SAVE_QUESTION_BEFORE_EMBED }),
      );
    };

    return (
      <SharingButton
        tooltip={t`You must save this question before sharing`}
        onClick={openSaveQuestionModal}
      />
    );
  }

  if (
    !isAdmin &&
    (!isPublicSharingEnabled || !hasPublicLink) &&
    !canManageSubscriptions
  ) {
    return (
      <SharingButton
        tooltip={t`Ask your admin to create a public link`}
        disabled
      />
    );
  }

  if (!isAdmin && hasPublicLink && !canManageSubscriptions) {
    return (
      <Flex>
        <SharingButton
          tooltip={t`Public link`}
          onClick={() => setModalType("question-public-link")}
        />
        <SharingModals
          modalType={modalType}
          question={question}
          onClose={() => setModalType(null)}
        />
      </Flex>
    );
  }

  return (
    <Flex>
      <SharingMenu>
        <AlertMenuItem
          question={question}
          onClick={() => setModalType("question-alert")}
        />
        <PublicLinkMenuItem
          hasPublicLink={hasPublicLink}
          onClick={() => setModalType("question-public-link")}
        />
        <EmbedMenuItem onClick={() => setModalType("question-embed")} />
      </SharingMenu>
      <SharingModals
        modalType={modalType}
        question={question}
        onClose={() => setModalType(null)}
      />
    </Flex>
  );
}
