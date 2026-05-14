import { useCallback, useState } from "react";
import { Link } from "react-router";
import { c, t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { ActionIcon, Box, Button, Icon, Menu } from "metabase/ui";
import type { Document } from "metabase-types/api";

import { trackDocumentPrint } from "../analytics";

import { DocumentPublicLinkPopover } from "./DocumentHeader/DocumentPublicLinkPopover/DocumentPublicLinkPopover";

export interface DocumentMenuProps {
  document: Document | undefined;
  isNewDocument?: boolean;
  canWrite: boolean;
  disablePrint?: boolean;
  isBookmarked?: boolean;
  onMove?: () => void;
  onDuplicate?: () => void;
  onToggleBookmark?: () => void;
  onArchive?: () => void;
  onShowHistory?: () => void;
}

export const DocumentMenu = ({
  document,
  isNewDocument = false,
  canWrite,
  disablePrint = false,
  isBookmarked = false,
  onMove,
  onDuplicate,
  onToggleBookmark,
  onArchive,
  onShowHistory,
}: DocumentMenuProps) => {
  const isPublicSharingEnabled = useSetting("enable-public-sharing");
  const isAdmin = useSelector(getUserIsAdmin);
  const [isPublicLinkPopoverOpen, setIsPublicLinkPopoverOpen] = useState(false);

  const hasPublicLink = !!document?.public_uuid;

  const handlePrint = useCallback(() => {
    window.print();
    trackDocumentPrint(document);
  }, [document]);

  return (
    <Box>
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
          {!disablePrint && (
            <Menu.Item
              leftSection={<Icon name="document" />}
              onClick={handlePrint}
            >
              {t`Print Document`}
            </Menu.Item>
          )}
          {!isNewDocument && (
            <>
              {isAdmin && (
                <Menu.Item
                  leftSection={<Icon name="link" />}
                  onClick={() => setIsPublicLinkPopoverOpen(true)}
                  {...(!isPublicSharingEnabled && {
                    onClick: undefined,
                    component: "div",
                    disabled: true,
                  })}
                >
                  {isPublicSharingEnabled ? (
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
              {canWrite && onMove && (
                <Menu.Item leftSection={<Icon name="move" />} onClick={onMove}>
                  {t`Move`}
                </Menu.Item>
              )}
              {onDuplicate && (
                <Menu.Item
                  leftSection={<Icon name="clone" />}
                  onClick={onDuplicate}
                >
                  {c("A verb, not a noun").t`Duplicate`}
                </Menu.Item>
              )}
              {onToggleBookmark && (
                <Menu.Item
                  leftSection={<Icon name="bookmark" />}
                  onClick={onToggleBookmark}
                >
                  {isBookmarked ? t`Remove from Bookmarks` : t`Bookmark`}
                </Menu.Item>
              )}
              {onShowHistory && (
                <Menu.Item
                  leftSection={<Icon name="history" />}
                  onClick={onShowHistory}
                >
                  {t`History`}
                </Menu.Item>
              )}
              {canWrite && onArchive && (
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
      {document && isAdmin && (
        <DocumentPublicLinkPopover
          document={document}
          isOpen={isPublicLinkPopoverOpen}
          onClose={() => setIsPublicLinkPopoverOpen(false)}
        />
      )}
    </Box>
  );
};
