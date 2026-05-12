import { useDisclosure } from "@mantine/hooks";
import { push } from "react-router-redux";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { trackMetricCreateStarted } from "metabase/data-studio/analytics";
import { PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { setOpenModalWithProps } from "metabase/redux/ui";
import {
  canUserCreateNativeQueries,
  canUserCreateQueries,
} from "metabase/selectors/user";
import { Button, FixedSizeIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type { CollectionId, CollectionNamespace } from "metabase-types/api";

import { PublishTableModal } from "./PublishTableModal";

export const CreateMenu = ({
  metricCollectionId,
  canWriteToMetricCollection,
  dataCollectionId,
  canWriteToDataCollection,
}: {
  metricCollectionId?: CollectionId;
  canWriteToMetricCollection?: boolean;
  dataCollectionId?: CollectionId;
  canWriteToDataCollection?: boolean;
}) => {
  const dispatch = useDispatch();
  const [
    showPublishTableModal,
    { close: closePublishTableModal, open: openPublishTableModal },
  ] = useDisclosure(false);

  const hasNativeWrite = useSelector(canUserCreateNativeQueries);
  const hasDataAccess = useSelector(canUserCreateQueries);
  const remoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);

  if (remoteSyncReadOnly) {
    return null;
  }

  const canCreateMetric =
    hasDataAccess && metricCollectionId && canWriteToMetricCollection;

  const canCreateCollection =
    (dataCollectionId && canWriteToDataCollection) ||
    (metricCollectionId && canWriteToMetricCollection) ||
    (hasNativeWrite && PLUGIN_SNIPPET_FOLDERS.isEnabled);

  const collectionNamespaces: CollectionNamespace[] = [];

  if (
    (dataCollectionId && canWriteToDataCollection) ||
    (metricCollectionId && canWriteToMetricCollection)
  ) {
    collectionNamespaces.push(null);
  }

  if (hasNativeWrite && PLUGIN_SNIPPET_FOLDERS.isEnabled) {
    collectionNamespaces.push("snippets");
  }

  const initialCollectionId =
    (dataCollectionId && canWriteToDataCollection && dataCollectionId) ||
    (metricCollectionId && canWriteToMetricCollection && metricCollectionId) ||
    null;

  const menuItems = [
    <Menu.Item
      key="publish-table"
      leftSection={<FixedSizeIcon name="publish" />}
      onClick={openPublishTableModal}
    >
      {t`Published table`}
    </Menu.Item>,
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
        to={Urls.newDataStudioSnippet()}
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
