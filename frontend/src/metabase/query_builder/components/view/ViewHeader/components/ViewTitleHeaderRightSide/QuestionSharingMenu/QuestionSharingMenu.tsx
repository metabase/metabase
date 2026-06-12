import { useMemo } from "react";
import { t } from "ttag";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import { useSetting } from "metabase/common/hooks";
import {
  AdminSharingMenu,
  CopyLinkButton,
  EmbedButton,
} from "metabase/embedding/components/SharingMenu/AdminSharingMenu";
import { LinkCopiedTooltipLabel } from "metabase/embedding/components/SharingMenu/LinkCopiedTooltipLabel";
import { PublicLinkMenuItem } from "metabase/embedding/components/SharingMenu/MenuItems/PublicLinkMenuItem";
import { SharingButton } from "metabase/embedding/components/SharingMenu/SharingMenu";
import type { QuestionSharingModalType } from "metabase/embedding/components/SharingMenu/types";
import { GUEST_EMBED_EMBEDDING_TYPE } from "metabase/embedding/constants";
import { useSharingModal } from "metabase/embedding/hooks/use-sharing-modal";
import { trackPublicLinkCopied } from "metabase/embedding/lib/analytics";
import { MODAL_TYPES } from "metabase/querying/constants";
import { useDispatch, useSelector } from "metabase/redux";
import { setUIControls } from "metabase/redux/query-builder";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, CopyButton, Flex, Group, Menu, Stack } from "metabase/ui";
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

// Copies the app link. Building the question URL converts the whole query,
// so don't redo it per render.
function CopyQuestionLinkButton({ question }: { question: Question }) {
  const siteUrl = useSetting("site-url");
  const url = useMemo(
    () => `${siteUrl}${getQuestionUrl(question)}`,
    [siteUrl, question],
  );

  return <CopyLinkButton url={url} />;
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
      <AdminSharingMenu>
        <Group p="lg" gap="md" wrap="nowrap">
          <CopyQuestionLinkButton question={question} />
          <EmbedButton
            onClick={() => setModalType(GUEST_EMBED_EMBEDDING_TYPE)}
          />
        </Group>
        {isPublicSharingEnabled && (
          <>
            <Menu.Divider />
            <Stack p="md" gap="sm">
              <PublicLinkMenuItem
                hasPublicLink={Boolean(question.publicUUID?.())}
                onClick={() => setModalType("question-public-link")}
              />
            </Stack>
          </>
        )}
      </AdminSharingMenu>
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

// Non-admins can't create public links. When one already exists the share
// button copies it directly; otherwise there's nothing to share, so it's hidden.
function NonAdminQuestionSharingMenu({ question }: { question: Question }) {
  const publicUuid = question.publicUUID?.();

  if (!publicUuid) {
    return null;
  }

  const url = getPublicQuestionUrl({ uuid: publicUuid });
  return (
    <CopyButton value={url} timeout={2000}>
      {({ copied, copy }) => (
        <SharingButton
          tooltip={copied ? <LinkCopiedTooltipLabel /> : t`Copy link`}
          aria-label={t`Copy link`}
          onClick={() => {
            copy();
            trackPublicLinkCopied({ artifact: "question", format: "html" });
          }}
        />
      )}
    </CopyButton>
  );
}
