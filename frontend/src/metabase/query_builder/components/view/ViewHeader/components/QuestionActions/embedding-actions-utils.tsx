import { t } from "ttag";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import type { QuestionExtraActionConfig } from "metabase/query_builder/components/view/ViewHeader/components/QuestionActions/types";
import {
  MODAL_TYPES,
  type QueryModalType,
} from "metabase/query_builder/constants";
import { EmbedMenuItem } from "metabase/sharing/components/SharingMenu/MenuItems/EmbedMenuItem";
import { PublicLinkMenuItem } from "metabase/sharing/components/SharingMenu/MenuItems/PublicLinkMenuItem";
import type Question from "metabase-lib/v1/Question";

export const getEmbeddingActions = ({
  question,
  isAdmin,
  isPublicSharingEnabled,
  onOpenModal,
}: {
  question: Question;
  isAdmin: boolean;
  isPublicSharingEnabled: boolean;
  onOpenModal: (modalType: QueryModalType) => void;
}): QuestionExtraActionConfig[] | null => {
  const isModel = question.type() === "model";
  const isArchived = question.isArchived();
  const collection = question.collection();
  const isAnalytics = collection && isInstanceAnalyticsCollection(collection);

  if (isModel || isArchived || isAnalytics) {
    return null;
  }

  const hasPublicLink = !!question?.publicUUID?.();

  const isUnsaved = !question.isSaved();

  const handleMenuItemClick = (modal: QueryModalType) => {
    if (!question.isSaved()) {
      onOpenModal(MODAL_TYPES.SAVE_QUESTION_BEFORE_EMBED);
    }

    onOpenModal(modal);
  };

  if (!isAdmin && (!isPublicSharingEnabled || !hasPublicLink)) {
    return [
      {
        title: t`Public link`,
        icon: "share",
        tooltip: t`Ask your admin to create a public link`,
        disabled: true,
        withTopSeparator: true,
      },
    ];
  }

  if (!isAdmin && hasPublicLink) {
    return [
      {
        title: t`Public link`,
        icon: "share",
        tooltip: isUnsaved
          ? t`You must save this question before sharing`
          : undefined,
        action: () => handleMenuItemClick("question-public-link"),
        withTopSeparator: true,
      },
    ];
  }

  return [
    {
      key: "public-link-item",
      component: (
        <PublicLinkMenuItem
          hasPublicLink={hasPublicLink}
          onClick={() => handleMenuItemClick("question-public-link")}
        />
      ),
      withTopSeparator: true,
    },
    {
      key: "embed-menu-item",
      component: (
        <EmbedMenuItem onClick={() => handleMenuItemClick("question-embed")} />
      ),
    },
  ];
};
