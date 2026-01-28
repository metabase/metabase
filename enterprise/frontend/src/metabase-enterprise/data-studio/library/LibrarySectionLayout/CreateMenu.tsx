import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import {
  canUserCreateNativeQueries,
  canUserCreateQueries,
} from "metabase/selectors/user";
import { Button, FixedSizeIcon, Icon, Menu } from "metabase/ui";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type { CollectionId } from "metabase-types/api";

import { PublishTableModal } from "./PublishTableModal";

export const CreateMenu = ({
  metricCollectionId,
  canWriteToMetricCollection,
}: {
  metricCollectionId?: CollectionId;
  canWriteToMetricCollection?: boolean;
}) => {
  const dispatch = useDispatch();
  const [modal, setModal] = useState<"snippet-folder" | "publish-table">();
  const closeModal = () => setModal(undefined);

  const hasNativeWrite = useSelector(canUserCreateNativeQueries);
  const hasDataAccess = useSelector(canUserCreateQueries);
  const remoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);

  if (remoteSyncReadOnly) {
    return null;
  }

  const canCreateMetric =
    hasDataAccess && metricCollectionId && canWriteToMetricCollection;

  const menuItems = [
    <Menu.Item
      key="publish-table"
      leftSection={<FixedSizeIcon name="publish" />}
      onClick={() => setModal("publish-table")}
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
    hasNativeWrite && PLUGIN_SNIPPET_FOLDERS.isEnabled && (
      <Menu.Item
        key="snippet-folder"
        leftSection={<FixedSizeIcon name="folder" />}
        onClick={() => setModal("snippet-folder")}
      >
        {t`Snippet folder`}
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
      <PLUGIN_SNIPPET_FOLDERS.CollectionFormModal
        opened={modal === "snippet-folder"}
        collection={{
          name: "",
          description: null,
        }}
        onClose={closeModal}
        onSaved={closeModal}
      />
      <PublishTableModal
        opened={modal === "publish-table"}
        onClose={closeModal}
        onPublished={(table) => dispatch(push(Urls.dataStudioTable(table.id)))}
      />
    </>
  );
};
