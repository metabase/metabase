import type { JSX } from "react";
import { t } from "ttag";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import {
  MODAL_TYPES,
  type QueryModalType,
} from "metabase/query_builder/constants";
import { EmbedMenuItem } from "metabase/sharing/components/SharingMenu/MenuItems/EmbedMenuItem";
import { PublicLinkMenuItem } from "metabase/sharing/components/SharingMenu/MenuItems/PublicLinkMenuItem";
import { Icon, Menu } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

type EmbeddingQuestionActionsProps = {
  question: Question;
  isAdmin: boolean;
  isPublicSharingEnabled: boolean;
  onOpenModal: (modalType: QueryModalType) => void;
};

export const EmbeddingQuestionActions = ({
  question,
  isAdmin,
  isPublicSharingEnabled,
  onOpenModal,
}: EmbeddingQuestionActionsProps): JSX.Element | null => {
  const isModel = question.type() === "model";
  const isArchived = question.isArchived();
  const collection = question.collection();
  const isAnalytics = collection && isInstanceAnalyticsCollection(collection);

  if (isModel || isArchived || isAnalytics) {
    return null;
  }

  const hasPublicLink = !!question?.publicUUID?.();
  const isUnsaved = !question.isSaved();

  if (!isAdmin && (!isPublicSharingEnabled || !hasPublicLink)) {
    return (
      <>
        <Menu.Divider />
        <Menu.Item icon={<Icon name="share" />} disabled>
          {t`Ask your admin to create a public link`}
        </Menu.Item>
      </>
    );
  }

  if (isUnsaved) {
    return (
      <>
        <Menu.Divider />
        <Menu.Item
          icon={<Icon name="share" />}
          onClick={() => onOpenModal(MODAL_TYPES.SAVE_QUESTION_BEFORE_EMBED)}
        >
          {t`You must save this question before sharing`}
        </Menu.Item>
      </>
    );
  }

  if (!isAdmin && hasPublicLink) {
    return (
      <>
        <Menu.Divider />
        <Menu.Item
          icon={<Icon name="share" />}
          onClick={() => onOpenModal("question-public-link")}
        >
          {t`Public link`}
        </Menu.Item>
      </>
    );
  }

  return (
    <>
      <Menu.Divider />
      <PublicLinkMenuItem
        hasPublicLink={hasPublicLink}
        onClick={() => onOpenModal("question-public-link")}
      />
      <EmbedMenuItem onClick={() => onOpenModal("question-embed")} />
    </>
  );
};
