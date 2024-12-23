import type { JSX } from "react";
import { t } from "ttag";

import {
  MODAL_TYPES,
  type QueryModalType,
} from "metabase/query_builder/constants";
import { EmbedMenuItem } from "metabase/sharing/components/EmbedMenuItem";
import { PublicLinkMenuItem } from "metabase/sharing/components/PublicLinkMenuItem";
import { Icon, Menu } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

type EmbeddingQuestionActionsProps = {
  question: Question;
  isAdmin: boolean;
  isPublicSharingEnabled: boolean;
  onOpenModal: (modalType: QueryModalType) => void;
  setShowPublicLinkPopover: (value: boolean) => void;
};

export const EmbeddingQuestionActions = ({
  question,
  isAdmin,
  isPublicSharingEnabled,
  onOpenModal,
  setShowPublicLinkPopover,
}: EmbeddingQuestionActionsProps): JSX.Element | null => {
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
          onClick={() => setShowPublicLinkPopover(true)}
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
        onClick={() => setShowPublicLinkPopover(true)}
      />
      <EmbedMenuItem onClick={() => onOpenModal(MODAL_TYPES.QUESTION_EMBED)} />
    </>
  );
};
