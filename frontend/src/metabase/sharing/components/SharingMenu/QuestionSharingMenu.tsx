import { useState } from "react";
import { t } from "ttag";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Flex } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

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

  if (isModel || isArchived || isAnalytics) {
    return null;
  }

  if (!isAdmin && (!isPublicSharingEnabled || !hasPublicLink)) {
    return (
      <SharingButton
        tooltip={t`Ask your admin to create a public link`}
        disabled
      />
    );
  }

  if (!isAdmin && hasPublicLink) {
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

  return (
    <Flex>
      <SharingMenu>
        {/** Alerts will go here someday */}
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
