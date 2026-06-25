import { useMemo } from "react";
import { t } from "ttag";

import { isInstanceAnalyticsCollection } from "metabase/common/collections/utils";
import { useSetting } from "metabase/common/hooks";
import { LinkCopiedTooltipLabel } from "metabase/embedding/components/SharingMenu/LinkCopiedTooltipLabel";
import {
  COPY_TIMEOUT_MS,
  CopyLinkMenuItem,
  CopyPublicLinkMenuItem,
} from "metabase/embedding/components/SharingMenu/MenuItems/CopyLinkMenuItem";
import { EmbedMenuItem } from "metabase/embedding/components/SharingMenu/MenuItems/EmbedMenuItem";
import { PublicLinkMenuItem } from "metabase/embedding/components/SharingMenu/MenuItems/PublicLinkMenuItem";
import {
  SharingButton,
  SharingMenu,
} from "metabase/embedding/components/SharingMenu/SharingMenu";
import type { QuestionSharingModalType } from "metabase/embedding/components/SharingMenu/types";
import { GUEST_EMBED_EMBEDDING_TYPE } from "metabase/embedding/constants";
import { useSharingModal } from "metabase/embedding/hooks/use-sharing-modal";
import { trackPublicLinkCopied } from "metabase/embedding/lib/analytics";
import { MODAL_TYPES } from "metabase/querying/constants";
import { useDispatch, useSelector } from "metabase/redux";
import { setUIControls } from "metabase/redux/query-builder";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, CopyButton, Flex } from "metabase/ui";
import {
  publicQuestion as getPublicQuestionUrl,
  question as getQuestionUrl,
} from "metabase/urls";
import type Question from "metabase-lib/v1/Question";

import { QuestionPublicLinkPopover } from "../../../../sidebars/QuestionInfoSidebar/QuestionPublicLinkPopover/QuestionPublicLinkPopover";

export function QuestionSharingMenu({ question }: { question: Question }) {
  const dispatch = useDispatch();
  const isAdmin = useSelector(getUserIsAdmin);
  const isModel = question.type() === "model";
  const isArchived = question.isArchived();
  const collection = question.collection();
  const isAnalytics = collection && isInstanceAnalyticsCollection(collection);

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

  return isAdmin ? (
    <AdminQuestionSharingMenu question={question} />
  ) : (
    <NonAdminQuestionSharingMenu question={question} />
  );
}

// Building the question URL converts the whole query, so don't redo it per render.
function useQuestionAppUrl(question: Question) {
  const siteUrl = useSetting("site-url");

  return useMemo(
    () => `${siteUrl}${getQuestionUrl(question)}`,
    [siteUrl, question],
  );
}

function CopyQuestionLinkMenuItem({ question }: { question: Question }) {
  return <CopyLinkMenuItem url={useQuestionAppUrl(question)} />;
}

function AdminQuestionSharingMenu({ question }: { question: Question }) {
  const { modalType, setModalType } = useSharingModal<QuestionSharingModalType>(
    {
      resource: question.card(),
      resourceType: "question",
    },
  );
  const isPublicSharingEnabled = useSetting("enable-public-sharing");

  return (
    <Flex>
      <SharingMenu>
        <CopyQuestionLinkMenuItem question={question} />
        {isPublicSharingEnabled && (
          <PublicLinkMenuItem
            hasPublicLink={Boolean(question.publicUUID?.())}
            onClick={() => setModalType("question-public-link")}
          />
        )}
        <EmbedMenuItem
          onClick={() => setModalType(GUEST_EMBED_EMBEDDING_TYPE)}
        />
      </SharingMenu>
      {modalType === "question-public-link" && (
        <QuestionPublicLinkPopover
          question={question}
          target={<Box h="2rem" />}
          isOpen
          onClose={() => setModalType(null)}
        />
      )}
    </Flex>
  );
}

// Non-admins can't create public links. When one already exists they get a
// menu with both copy options; otherwise the button copies the app link directly.
function NonAdminQuestionSharingMenu({ question }: { question: Question }) {
  const publicUuid = question.publicUUID?.();

  if (!publicUuid) {
    return <CopyQuestionLinkButton question={question} />;
  }

  return (
    <SharingMenu>
      <CopyQuestionLinkMenuItem question={question} />
      <CopyPublicLinkMenuItem
        url={getPublicQuestionUrl({ uuid: publicUuid })}
        onCopied={() =>
          trackPublicLinkCopied({ artifact: "question", format: "html" })
        }
      />
    </SharingMenu>
  );
}

function CopyQuestionLinkButton({ question }: { question: Question }) {
  const url = useQuestionAppUrl(question);

  return (
    <CopyButton value={url} timeout={COPY_TIMEOUT_MS}>
      {({ copied, copy }) => (
        <SharingButton
          tooltip={copied ? <LinkCopiedTooltipLabel /> : t`Copy link`}
          aria-label={t`Copy link`}
          onClick={copy}
        />
      )}
    </CopyButton>
  );
}
