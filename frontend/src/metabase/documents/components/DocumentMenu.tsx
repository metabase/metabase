import { useCallback, useState } from "react";
import { Link } from "react-router";
import { c, t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { waitUntilNextFramePainted } from "metabase/common/utils/wait-until-next-frame-paints";
import CS from "metabase/css/core/index.css";
import { usePrintContext } from "metabase/documents/contexts/PrintContext";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { ActionIcon, Box, Button, Icon, Loader, Menu } from "metabase/ui";
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

  const { prepareForPrint } = usePrintContext();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPreparingForPrint, setIsPreparingForPrint] = useState(false);

  const handlePrint = useCallback(async () => {
    setIsPreparingForPrint(true);
    try {
      await prepareForPrint();
    } finally {
      setIsPreparingForPrint(false);
    }
    setIsMenuOpen(false);
    await waitUntilNextFramePainted();
    window.print();
    trackDocumentPrint(document);
  }, [document, prepareForPrint]);

  const handleMenuChange = useCallback(
    (opened: boolean) => {
      if (!opened && isPreparingForPrint) {
        return;
      }

      setIsMenuOpen(opened);
    },
    [isPreparingForPrint],
  );

  return (
    <Box>
      <Menu
        position="bottom-end"
        opened={isMenuOpen}
        onChange={handleMenuChange}
      >
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
              leftSection={
                isPreparingForPrint ? (
                  <Loader size="xs" />
                ) : (
                  <Icon name="document" />
                )
              }
              closeMenuOnClick={false}
              disabled={isPreparingForPrint}
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
