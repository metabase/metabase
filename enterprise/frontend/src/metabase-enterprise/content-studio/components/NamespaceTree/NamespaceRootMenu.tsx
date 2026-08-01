import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { ActionIcon, Box, Icon, Menu, Tooltip } from "metabase/ui";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";

import { useContentStudioScope } from "../../scope";
import { NewCollectionModal } from "../NewCollectionModal";

import type { ContentStudioNamespaceSection } from "./NamespaceTree";

type NamespaceRootMenuProps = {
  section: ContentStudioNamespaceSection;
  label: string;
};

/**
 * Actions on a namespace root row. The menu owns its target so Mantine can
 * anchor the dropdown to it.
 */
export function NamespaceRootMenu({ section, label }: NamespaceRootMenuProps) {
  const { worktreeId } = useContentStudioScope();
  const isReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const [isModalOpen, { open: openModal, close: closeModal }] =
    useDisclosure(false);

  // Read-only sync protects the instance's own branch; a checked-out branch is
  // an admin's working copy and stays editable.
  const isBlocked = worktreeId == null && isReadOnly;

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon aria-label={t`${label} options`} color="text-secondary">
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Tooltip
            label={t`Remote sync is in read-only mode.`}
            disabled={!isBlocked}
            position="right"
          >
            <Box>
              <Menu.Item
                leftSection={<Icon name="folder" />}
                disabled={isBlocked}
                onClick={openModal}
              >
                {t`New collection`}
              </Menu.Item>
            </Box>
          </Tooltip>
        </Menu.Dropdown>
      </Menu>

      {isModalOpen && (
        <NewCollectionModal namespace={section} onClose={closeModal} />
      )}
    </>
  );
}
