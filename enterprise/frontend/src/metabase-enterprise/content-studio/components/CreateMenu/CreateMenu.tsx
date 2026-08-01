import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { CreateDashboardModal } from "metabase/common/CreateDashboard/CreateDashboardModal";
import { ForwardRefLink } from "metabase/common/components/Link";
import { useSelector } from "metabase/redux";
import { canUserCreateQueries } from "metabase/selectors/user";
import { Button, FixedSizeIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Collection } from "metabase-types/api";

import { NewCollectionModal } from "../NewCollectionModal";

type CreateMenuProps = {
  collection: Collection;
};

/**
 * Creates content inside a collection on screen in Content Studio. A collection
 * checked out on a branch passes itself as the target of every flow, because the
 * general collection picker only lists the main branch — the backend then stamps
 * the branch onto whatever is created there.
 */
export function CreateMenu({ collection }: CreateMenuProps) {
  const canCreateQueries = useSelector(canUserCreateQueries);
  const [
    isDashboardModalOpen,
    { open: openDashboardModal, close: closeDashboardModal },
  ] = useDisclosure(false);
  const [
    isCollectionModalOpen,
    { open: openCollectionModal, close: closeCollectionModal },
  ] = useDisclosure(false);

  // `can_write` is false for a synced collection on a read-only instance, and
  // true for a branch collection whatever the instance's sync mode.
  if (!collection.can_write) {
    return null;
  }

  const isBranchCollection = collection.worktree_id != null;

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button leftSection={<Icon name="add" />}>{t`New`}</Button>
        </Menu.Target>
        <Menu.Dropdown>
          {canCreateQueries && (
            <Menu.Item
              component={ForwardRefLink}
              to={Urls.newQuestion({
                mode: "notebook",
                creationType: "custom_question",
                collectionId: collection.id,
                cardType: "question",
              })}
              leftSection={<FixedSizeIcon name="insight" />}
            >
              {t`Question`}
            </Menu.Item>
          )}
          <Menu.Item
            leftSection={<FixedSizeIcon name="dashboard" />}
            onClick={openDashboardModal}
          >
            {t`Dashboard`}
          </Menu.Item>
          <Menu.Item
            leftSection={<FixedSizeIcon name="folder" />}
            onClick={openCollectionModal}
          >
            {t`Collection`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {isDashboardModalOpen && (
        <CreateDashboardModal
          opened
          collectionId={isBranchCollection ? undefined : collection.id}
          targetCollection={isBranchCollection ? collection.id : undefined}
          onClose={closeDashboardModal}
        />
      )}
      {isCollectionModalOpen && (
        <NewCollectionModal
          parentCollection={collection}
          onClose={closeCollectionModal}
        />
      )}
    </>
  );
}
