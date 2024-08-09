import { useState } from "react";
import { t } from "ttag";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import {
  getUserIsAdmin,
  canManageSubscriptions as canManageSubscriptionsSelector,
} from "metabase/selectors/user";
import { Flex } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { AlertMenuItem } from "./MenuItems/AlertMenuItem";
import { EmbedMenuItem } from "./MenuItems/EmbedMenuItem";
import { PublicLinkMenuItem } from "./MenuItems/PublicLinkMenuItem";
import { SharingMenu, SharingButton } from "./SharingMenu";
import { SharingModals } from "./SharingModals";
import type { QuestionSharingModalType } from "./types";

export function QuestionSharingMenu({ question }: { question: Question }) {
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

  // TODO: handle prompt to save before sharing
  // TODO: prompt admins to setup notification channels

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
