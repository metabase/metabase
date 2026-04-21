import { t } from "ttag";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import { useSetting } from "metabase/common/hooks";
import { EmbedMenuItem } from "metabase/embed/components/SharingMenu/MenuItems/EmbedMenuItem";
import { PublicLinkMenuItem } from "metabase/embed/components/SharingMenu/MenuItems/PublicLinkMenuItem";
import {
  SharingButton,
  SharingMenu,
} from "metabase/embed/components/SharingMenu/SharingMenu";
import type { QuestionSharingModalType } from "metabase/embed/components/SharingMenu/types";
import { GUEST_EMBED_EMBEDDING_TYPE } from "metabase/embed/constants";
import { useSharingModal } from "metabase/embed/hooks/use-sharing-modal";
import { MODAL_TYPES } from "metabase/querying/constants";
import { setUIControls } from "metabase/redux/query-builder";
import {
  canManageSubscriptions as canManageSubscriptionsSelector,
  getUserIsAdmin,
} from "metabase/selectors/user";
import { Box, Flex } from "metabase/ui";
import { useDispatch, useSelector } from "metabase/utils/redux";
import type Question from "metabase-lib/v1/Question";

import { QuestionPublicLinkPopover } from "../../../../sidebars/QuestionInfoSidebar/QuestionPublicLinkPopover/QuestionPublicLinkPopover";

export function QuestionSharingMenu({ question }: { question: Question }) {
  const dispatch = useDispatch();
  const { modalType, setModalType } = useSharingModal<QuestionSharingModalType>(
    {
      resource: question.card(),
      resourceType: "question",
    },
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
        <QuestionPublicLinkPopover
          question={question}
          target={<Box h="2rem" />}
          isOpen={modalType === "question-public-link"}
          onClose={() => setModalType(null)}
        />
      </Flex>
    );
  }

  return (
    <Flex>
      <SharingMenu>
        <PublicLinkMenuItem
          hasPublicLink={hasPublicLink}
          onClick={() => setModalType("question-public-link")}
        />
        <EmbedMenuItem
          onClick={() => setModalType(GUEST_EMBED_EMBEDDING_TYPE)}
        />
      </SharingMenu>
      <QuestionPublicLinkPopover
        question={question}
        target={<Box h="2rem" />}
        isOpen={modalType === "question-public-link"}
        onClose={() => setModalType(null)}
      />
    </Flex>
  );
}
