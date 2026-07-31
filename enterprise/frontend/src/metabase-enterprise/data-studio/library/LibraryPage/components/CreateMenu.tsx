import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { trackMetricCreateStarted } from "metabase/common/data-studio/analytics";
import { PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { setOpenModalWithProps } from "metabase/redux/ui";
import { push } from "metabase/router";
import {
  canUserCreateNativeQueries,
  canUserCreateQueries,
} from "metabase/selectors/user";
import { Button, FixedSizeIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type {
  CollectionId,
  CollectionNamespace,
  RemoteSyncWorktreeId,
} from "metabase-types/api";

import { PublishTableModal } from "./PublishTableModal";

export const CreateMenu = ({
  metricCollectionId,
  canWriteToMetricCollection,
  dataCollectionId,
  canWriteToDataCollection,
  worktreeId = null,
}: {
  metricCollectionId?: CollectionId;
  canWriteToMetricCollection?: boolean;
  dataCollectionId?: CollectionId;
  canWriteToDataCollection?: boolean;
  worktreeId?: RemoteSyncWorktreeId | null;
}) => {
  const dispatch = useDispatch();
  const [
    showPublishTableModal,
    { close: closePublishTableModal, open: openPublishTableModal },
  ] = useDisclosure(false);

  const hasNativeWrite = useSelector(canUserCreateNativeQueries);
  const hasDataAccess = useSelector(canUserCreateQueries);
  const remoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const isWorktreeView = worktreeId != null;

  // A worktree is an admin's working copy of its branch, so read-only sync does not apply inside it.
  if (remoteSyncReadOnly && !isWorktreeView) {
    return null;
  }

  const canCreateMetric =
    hasDataAccess && metricCollectionId && canWriteToMetricCollection;

  // Snippet folders live in a namespace the worktree flow can't create collections in.
  const canCreateSnippetFolder =
    hasNativeWrite && PLUGIN_SNIPPET_FOLDERS.isEnabled && !isWorktreeView;

  const canCreateCollection =
    (dataCollectionId && canWriteToDataCollection) ||
    (metricCollectionId && canWriteToMetricCollection) ||
    canCreateSnippetFolder;

  const collectionNamespaces: CollectionNamespace[] = [];

  if (
    (dataCollectionId && canWriteToDataCollection) ||
    (metricCollectionId && canWriteToMetricCollection)
  ) {
    collectionNamespaces.push(null);
  }

  if (canCreateSnippetFolder) {
    collectionNamespaces.push("snippets");
  }

  const initialCollectionId =
    (dataCollectionId && canWriteToDataCollection && dataCollectionId) ||
    (metricCollectionId && canWriteToMetricCollection && metricCollectionId) ||
    null;

  const menuItems = [
    // Published tables are shared app-wide (tables are never worktree-scoped).
    !isWorktreeView && (
      <Menu.Item
        key="publish-table"
        leftSection={<FixedSizeIcon name="publish" />}
        onClick={openPublishTableModal}
      >
        {t`Published table`}
      </Menu.Item>
    ),
    canCreateMetric && (
      <Menu.Item
        key="metric"
        component={ForwardRefLink}
        to={Urls.newDataStudioMetric({
          collectionId: metricCollectionId,
        })}
        leftSection={<FixedSizeIcon name="metric" />}
        onClickCapture={() => trackMetricCreateStarted("data_studio_library")}
      >
        {t`Metric`}
      </Menu.Item>
    ),
    hasNativeWrite && (
      <Menu.Item
        key="snippet"
        component={ForwardRefLink}
        to={Urls.newDataStudioSnippet(isWorktreeView ? { worktreeId } : {})}
        leftSection={<FixedSizeIcon name="snippet" />}
        aria-label={t`Create new snippet`}
      >
        {t`Snippet`}
      </Menu.Item>
    ),
    canCreateCollection && (
      <Menu.Item
        key="collection"
        leftSection={<FixedSizeIcon name="folder" />}
        onClick={() =>
          dispatch(
            setOpenModalWithProps({
              id: "collection",
              props: {
                initialCollectionId,
                namespaces: collectionNamespaces,
                pickerOptions: LIBRARY_COLLECTION_PICKER_OPTIONS,
                showAuthorityLevelPicker: false,
                // The picker only offers main-app collections, which would silently
                // move the new collection out of the worktree.
                showCollectionPicker: !isWorktreeView,
                inDataStudio: true,
              },
            }),
          )
        }
      >
        {t`Collection`}
      </Menu.Item>
    ),
  ].filter(Boolean);

  if (!menuItems.length) {
    return null;
  }

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button leftSection={<Icon name="add" />}>{t`New`}</Button>
        </Menu.Target>
        <Menu.Dropdown>{menuItems}</Menu.Dropdown>
      </Menu>
      <PublishTableModal
        opened={showPublishTableModal}
        onClose={closePublishTableModal}
        onPublished={(table) => dispatch(push(Urls.dataStudioTable(table.id)))}
      />
    </>
  );
};

const LIBRARY_COLLECTION_PICKER_OPTIONS = {
  hasLibrary: true,
  hasRootCollection: false,
  hasPersonalCollections: false,
  hasRecents: false,
  hasSearch: false,
  hasConfirmButtons: true,
  canCreateCollections: false,
};
