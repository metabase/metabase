import { useState } from "react";

import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import type Question from "metabase-lib/v1/Question";

import { EmbedMenuItem } from "./MenuItems/EmbedMenuItem";
import { PublicLinkMenuItem } from "./MenuItems/PublicLinkMenuItem";
import { SharingMenu } from "./SharingMenu";
import { SharingModals } from "./SharingModals";
import type { QuestionSharingModalType } from "./types";

export function QuestionSharingMenu({ question }: { question: Question }) {
  const [modalType, setModalType] = useState<QuestionSharingModalType | null>(
    null,
  );
  const isPublicSharingEnabled = useSetting("enable-public-sharing");
  const isEmbeddingEnabled = useSetting("enable-embedding");
  const isAdmin = useSelector(getUserIsAdmin);

  const hasPublicLink = !!question?.publicUUID?.();

  const canShare = isAdmin || isPublicSharingEnabled || isEmbeddingEnabled;

  if (!question?.isSaved() || !canShare) {
    return null;
  }

  return (
    <>
      <SharingModals
        modalType={modalType}
        question={question}
        onClose={() => setModalType(null)}
      />
      <SharingMenu>
        {/** Alerts will go here someday */}
        <PublicLinkMenuItem
          hasPublicLink={hasPublicLink}
          onClick={() => setModalType("question-public-link")}
        />
        <EmbedMenuItem onClick={() => setModalType("question-embed")} />
      </SharingMenu>
    </>
  );
}
