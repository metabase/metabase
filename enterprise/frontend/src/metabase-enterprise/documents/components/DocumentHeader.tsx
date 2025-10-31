import { useCallback, useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import DateTime, {
  getFormattedTime,
} from "metabase/common/components/DateTime";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { isWithinIframe } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Icon,
  Menu,
  Text,
  TextInput,
  Tooltip,
  Transition,
  type TransitionProps,
} from "metabase/ui";
import { DocumentPublicLinkPopover } from "metabase-enterprise/embedding/components/PublicLinkPopover";
import type { Document } from "metabase-types/api";

import { trackDocumentPrint } from "../analytics";
import { DOCUMENT_TITLE_MAX_LENGTH } from "../constants";

import S from "./DocumentHeader.module.css";

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
  onSave: () => void;
  onMove: () => void;
  onToggleBookmark: () => void;
  onArchive: () => void;
  hasComments?: boolean;
}

export const DocumentHeader = ({
  document,
  documentTitle,
  isNewDocument,
  canWrite,
  showSaveButton,
  isBookmarked,
  onTitleChange,
  onSave,
  onMove,
  onToggleBookmark,
  onArchive,
  hasComments = false,
}: DocumentHeaderProps) => {
  const isPublicSharingEnabled = useSetting("enable-public-sharing");
  const hasDocumentsFeature = useHasTokenFeature("documents");
  const isAdmin = useSelector(getUserIsAdmin);
  const [isPublicLinkPopoverOpen, setIsPublicLinkPopoverOpen] = useState(false);

  const hasPublicLink = !!document?.public_uuid;
  const canUsePublicSharing = isPublicSharingEnabled && hasDocumentsFeature;

  const handlePrint = useCallback(() => {
    window.print();
    trackDocumentPrint(document);
  }, [document]);

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
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                size="md"
                aria-label={t`More options`}
                data-hide-on-print
              >
                <Icon name="ellipsis" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<Icon name="document" />}
                onClick={handlePrint}
              >
                {t`Print Document`}
              </Menu.Item>
              {!isNewDocument && (
                <>
                  {isAdmin && (
                    <Menu.Item
                      leftSection={<Icon name="link" />}
                      onClick={() => setIsPublicLinkPopoverOpen(true)}
                      {...(!canUsePublicSharing && {
                        onClick: undefined,
                        component: "div",
                        disabled: true,
                      })}
                    >
                      {canUsePublicSharing ? (
                        hasPublicLink ? (
                          t`Public link`
                        ) : (
                          t`Create a public link`
                        )
                      ) : (
                        <>
                          {t`Public link`}
                          <Button
                            component={Link}
                            to="/admin/settings/public-sharing"
                            target="_blank"
                            variant="subtle"
                            h="auto"
                            lh="inherit"
                            ml="sm"
                            p={0}
                            bd={0}
                            className={CS.floatRight}
                          >
                            {t`Enable`}
                          </Button>
                        </>
                      )}
                    </Menu.Item>
                  )}
                  {canWrite && (
                    <Menu.Item
                      leftSection={<Icon name="move" />}
                      onClick={onMove}
                    >
                      {t`Move`}
                    </Menu.Item>
                  )}
                  <Menu.Item
                    leftSection={<Icon name={"bookmark"} />}
                    onClick={onToggleBookmark}
                  >
                    {isBookmarked ? t`Remove from Bookmarks` : t`Bookmark`}
                  </Menu.Item>
                  {canWrite && (
                    <>
                      <Menu.Divider />
                      <Menu.Item
                        leftSection={<Icon name="trash" />}
                        onClick={onArchive}
                      >
                        {t`Move to trash`}
                      </Menu.Item>
                    </>
                  )}
                </>
              )}
            </Menu.Dropdown>
          </Menu>
        )}
        {document && isAdmin && (
          <DocumentPublicLinkPopover
            document={document}
            isOpen={isPublicLinkPopoverOpen}
            onClose={() => setIsPublicLinkPopoverOpen(false)}
          />
        )}
      </Flex>
    </Flex>
  );
};
