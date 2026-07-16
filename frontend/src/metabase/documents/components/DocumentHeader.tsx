import { t } from "ttag";

import { useListCommentsQuery } from "metabase/api";
import { getListCommentsQuery } from "metabase/comments/utils";
import {
  DateTime,
  getFormattedTime,
} from "metabase/common/components/DateTime";
import { Link } from "metabase/router";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Icon,
  Text,
  TextInput,
  Tooltip,
  Transition,
  type TransitionProps,
} from "metabase/ui";
import { isWithinIframe } from "metabase/utils/iframe";
import type { Document } from "metabase-types/api";

import { DOCUMENT_TITLE_MAX_LENGTH } from "../constants";

import S from "./DocumentHeader.module.css";
import { DocumentMenu } from "./DocumentMenu";

const saveButtonTransition: TransitionProps["transition"] = {
  in: { opacity: 1, visibility: "visible", width: "auto" },
  out: { opacity: 0, visibility: "hidden", width: 0 },
  transitionProperty: "opacity",
};

interface DocumentHeaderProps {
  document: Document | undefined;
  documentTitle: string;
  isNewDocument: boolean;
  canWrite: boolean;
  showSaveButton: boolean;
  isBookmarked: boolean;
  onTitleChange: (title: string) => void;
  onTitleSubmit?: () => void;
  onSave: () => void;
  onMove: () => void;
  onDuplicate: () => void;
  onToggleBookmark: () => void;
  onArchive: () => void;
  onShowHistory: () => void;
}

export const DocumentHeader = ({
  document,
  documentTitle,
  isNewDocument,
  canWrite,
  showSaveButton,
  isBookmarked,
  onTitleChange,
  onTitleSubmit,
  onSave,
  onMove,
  onDuplicate,
  onToggleBookmark,
  onArchive,
  onShowHistory,
}: DocumentHeaderProps) => {
  const { hasComments } = useListCommentsQuery(
    getListCommentsQuery(
      document
        ? {
            target_id: document?.id,
            target_type: "document",
          }
        : null,
    ),
    {
      selectFromResult: ({ data }) => ({
        hasComments: !isNewDocument && !!data?.comments?.length,
      }),
    },
  );

  return (
    <Flex
      justify="space-between"
      align="flex-start"
      gap="1rem"
      mt="xl"
      pt="xl"
      pb="1rem"
      maw={900}
      mx="auto"
      w="100%"
    >
      <Flex direction="column" className={S.titleContainer}>
        <TextInput
          aria-label={t`Document Title`}
          autoFocus={isNewDocument}
          value={documentTitle}
          onChange={(event) => {
            const value = event.currentTarget.value;
            if (value.length <= DOCUMENT_TITLE_MAX_LENGTH) {
              onTitleChange(value);
            }
          }}
          placeholder={t`New document`}
          readOnly={!canWrite}
          maxLength={DOCUMENT_TITLE_MAX_LENGTH}
          classNames={{ input: S.titleInput }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();

              if (canWrite) {
                onTitleSubmit?.();
              }
            }
          }}
        />
        {document && (
          <Flex gap="md">
            <Flex align="center" gap="0.25rem" c="text-secondary">
              <Icon name="person" />
              <Text>{document.creator.common_name}</Text>
            </Flex>
            <Tooltip
              label={getFormattedTime(document.updated_at, "default", {
                local: true,
              })}
            >
              <Flex align="center" gap="0.25rem" c="text-secondary">
                <Icon name="clock" />
                <DateTime value={document.updated_at} unit="day" />
              </Flex>
            </Tooltip>
          </Flex>
        )}
      </Flex>
      <Flex gap="md" align="center" className={S.actionsContainer}>
        <Transition
          mounted={showSaveButton}
          transition={saveButtonTransition}
          duration={200}
          keepMounted
        >
          {(style) => (
            <Box
              style={
                style.display === "none" ? saveButtonTransition.out : style
              }
            >
              <Button onClick={onSave} variant="filled" data-hide-on-print>
                {t`Save`}
              </Button>
            </Box>
          )}
        </Transition>
        {!isNewDocument && hasComments && !isWithinIframe() && (
          <Tooltip label={t`Show all comments`}>
            <Box>
              {document && (
                <ActionIcon
                  className={S.commentsIcon}
                  component={Link}
                  to={`/document/${document.id}/comments/all`}
                  size="md"
                  aria-label={t`Show all comments`}
                  data-hide-on-print
                >
                  <Icon name="comment" />
                </ActionIcon>
              )}
            </Box>
          </Tooltip>
        )}
        {!document?.archived && (
          <DocumentMenu
            document={document}
            isNewDocument={isNewDocument}
            canWrite={canWrite}
            isBookmarked={isBookmarked}
            onMove={onMove}
            onDuplicate={onDuplicate}
            onToggleBookmark={onToggleBookmark}
            onArchive={onArchive}
            onShowHistory={onShowHistory}
          />
        )}
      </Flex>
    </Flex>
  );
};
