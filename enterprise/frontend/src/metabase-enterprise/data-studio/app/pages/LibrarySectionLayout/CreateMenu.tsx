import { useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import {
  canUserCreateNativeQueries,
  canUserCreateQueries,
} from "metabase/selectors/user";
import { Button, FixedSizeIcon, Icon, Menu } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

export const CreateMenu = ({
  metricCollectionId,
}: {
  modelCollectionId?: CollectionId;
  metricCollectionId?: CollectionId;
}) => {
  const [creatingSnippetFolder, setCreatingSnippetFolder] = useState(false);

  const hasNativeWrite = useSelector(canUserCreateNativeQueries);
  const hasDataAccess = useSelector(canUserCreateQueries);

  const canCreateMetric = hasDataAccess && metricCollectionId;

  const menuItems = [
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
        {t`New snippet`}
      </Menu.Item>
    ),
    hasNativeWrite && PLUGIN_SNIPPET_FOLDERS.isEnabled && (
      <Menu.Item
        key="snippet-folder"
        leftSection={<FixedSizeIcon name="folder" />}
        onClick={() => setCreatingSnippetFolder(true)}
      >
        {t`New snippet folder`}
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
        opened={creatingSnippetFolder}
        collection={{
          name: "",
          description: null,
        }}
        onClose={() => setCreatingSnippetFolder(false)}
        onSaved={() => setCreatingSnippetFolder(false)}
      />
    </>
  );
};
