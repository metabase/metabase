import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { t } from "ttag";

import { isInstanceAnalyticsCollection } from "metabase/common/collections/utils";
import { useSetting } from "metabase/common/hooks";
import { CopyLinkButton } from "metabase/embedding/components/SharingMenu/ActionButtons/CopyLinkButton";
import { EmbedButton } from "metabase/embedding/components/SharingMenu/ActionButtons/EmbedButton";
import { InviteToViewModal } from "metabase/embedding/components/SharingMenu/InviteToViewModal";
import {
  COPY_TIMEOUT_MS,
  LinkCopiedTooltipLabel,
} from "metabase/embedding/components/SharingMenu/LinkCopiedTooltipLabel";
import { CopyPublicLinkMenuItem } from "metabase/embedding/components/SharingMenu/MenuItems/CopyPublicLinkMenuItem";
import { InviteToViewMenuItem } from "metabase/embedding/components/SharingMenu/MenuItems/InviteToViewMenuItem";
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

function AdminQuestionSharingMenu({ question }: { question: Question }) {
  const { modalType, setModalType } = useSharingModal<QuestionSharingModalType>(
    {
      resource: question.card(),
      resourceType: "question",
    },
  );
  const [isInviteOpen, { open: openInvite, close: closeInvite }] =
    useDisclosure();
  const isPublicSharingEnabled = useSetting("enable-public-sharing");
  // Creating a public link is a write, so hide that action when the question is
  // not writable (e.g. a remote-synced entity on a read-only instance). An
  // existing public link stays visible either way — viewing and copying it are
  // reads. Embedding stays available; its Publish button is disabled instead.
  const canWrite = question.canWrite();
  const hasPublicLink = Boolean(question.publicUUID?.());
  const shareUrl = useQuestionAppUrl(question);

  return (
    <Flex>
      <SharingMenu
        actions={
          <>
            <CopyLinkButton url={shareUrl} />
            <EmbedButton
              onClick={() => setModalType(GUEST_EMBED_EMBEDDING_TYPE)}
            />
          </>
        }
      >
        <InviteToViewMenuItem onClick={openInvite} />
        {isPublicSharingEnabled && (hasPublicLink || canWrite) && (
          <PublicLinkMenuItem
            hasPublicLink={hasPublicLink}
            onClick={() => setModalType("question-public-link")}
          />
        )}
      </SharingMenu>
      {modalType === "question-public-link" && (
        <QuestionPublicLinkPopover
          question={question}
          target={<Box h="2rem" />}
          isOpen
          onClose={() => setModalType(null)}
        />
      )}
      {isInviteOpen && (
        <InviteToViewModal
          title={t`Invite someone to view this question`}
          shareUrl={shareUrl}
          triggeredFrom="question"
          inviteTarget={{
            type: "question",
            id: question.id(),
            name: question.card().name,
          }}
          onClose={closeInvite}
        />
      )}
    </Flex>
  );
}

// Non-admins can't create public links. When one already exists they get the
// popover with both copy options; otherwise the button copies the app link directly.
function NonAdminQuestionSharingMenu({ question }: { question: Question }) {
  const appUrl = useQuestionAppUrl(question);
  const publicUuid = question.publicUUID?.();

  if (!publicUuid) {
    return <CopyQuestionLinkButton url={appUrl} />;
  }

  return (
    <SharingMenu actions={<CopyLinkButton url={appUrl} />}>
      <CopyPublicLinkMenuItem
        url={getPublicQuestionUrl({ uuid: publicUuid })}
        onCopied={() =>
          trackPublicLinkCopied({ artifact: "question", format: "html" })
        }
      />
    </SharingMenu>
  );
}

function CopyQuestionLinkButton({ url }: { url: string }) {
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
