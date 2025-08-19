import { useCallback } from "react";
import { t } from "ttag";

import DateTime, {
  getFormattedTime,
} from "metabase/common/components/DateTime";
import {
  ActionIcon,
  Button,
  Flex,
  Icon,
  Menu,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";
import type { Document } from "metabase-types/api";

import { DOCUMENT_TITLE_MAX_LENGTH } from "../constants";

import S from "./DocumentHeader.module.css";

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
}: DocumentHeaderProps) => {
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

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
        {showSaveButton && (
          <Button onClick={onSave} variant="filled" data-hide-on-print>
            {t`Save`}
          </Button>
        )}
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
      </Flex>
    </Flex>
  );
};
