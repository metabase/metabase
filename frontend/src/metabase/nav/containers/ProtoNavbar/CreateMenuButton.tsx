import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import CreateCollectionModal from "metabase/common/collections/containers/CreateCollectionModal";
import { ForwardRefLink } from "metabase/common/components/Link";
import {
  getIsTenantUser,
  getUserCanWriteToCollections,
} from "metabase/current-user";
import { useDispatch, useSelector } from "metabase/redux";
import { setOpenModal } from "metabase/redux/ui";
import { useNavigate } from "metabase/router";
import { ActionIcon, FixedSizeIcon, Icon, Menu, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";

import { trackNewCollectionFromNavInitiated } from "../MainNavbar/analytics";

// "+" in the proto nav header: create a collection, dashboard, or document.
export function CreateMenuButton() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const canWriteToCollections = useSelector(getUserCanWriteToCollections);
  const isTenantUser = useSelector(getIsTenantUser);
  const [
    isCollectionModalOpen,
    { open: openCollectionModal, close: closeCollectionModal },
  ] = useDisclosure(false);

  if (!canWriteToCollections || isTenantUser) {
    return null;
  }

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <Tooltip label={t`Create`}>
            <ActionIcon aria-label={t`Create new…`} c="text-secondary">
              <FixedSizeIcon name="add" />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="folder" />}
            onClick={() => {
              trackNewCollectionFromNavInitiated();
              openCollectionModal();
            }}
          >
            {t`Collection`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="dashboard" />}
            onClick={() => dispatch(setOpenModal("dashboard"))}
          >
            {t`Dashboard`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="document" />}
            component={ForwardRefLink}
            to="/document/new"
          >
            {t`Document`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {isCollectionModalOpen && (
        <CreateCollectionModal
          onClose={closeCollectionModal}
          onCreate={(collection) => navigate(Urls.collection(collection))}
        />
      )}
    </>
  );
}
