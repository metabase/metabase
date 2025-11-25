import { t } from "ttag";

import { Button, FixedSizeIcon, Icon, Loader, Menu } from "metabase/ui";
import { ForwardRefLink } from "metabase/common/components/Link";

import * as Urls from "metabase/lib/urls";
import { useState } from "react";
import { CollectionId } from "metabase-types/api";
import { PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import { useSelector } from "metabase/lib/redux";

import {
  canUserCreateNativeQueries,
  canUserCreateQueries,
} from "metabase/selectors/user";

export const CreateMenu = ({
  modelCollectionId,
  metricCollectionId,
}: {
  modelCollectionId?: CollectionId;
  metricCollectionId?: CollectionId;
}) => {
  const [creatingSnippetFolder, setCreatingSnippetFolder] = useState(false);

  const hasDataAccess = useSelector(canUserCreateQueries);

  const canCreateMetric = hasDataAccess && metricCollectionId;

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button leftSection={<Icon name="add" />}>{t`New`}</Button>
        </Menu.Target>
        <Menu.Dropdown>
          {canCreateMetric && (
            <Menu.Item
              component={ForwardRefLink}
              to={Urls.newDataStudioMetric({
                collectionId: metricCollectionId,
              })}
              leftSection={<FixedSizeIcon name="metric" />}
            >
              {t`Metric`}
            </Menu.Item>
          )}
          <Menu.Item
            component={ForwardRefLink}
            to={Urls.newDataStudioSnippet()}
            leftSection={<FixedSizeIcon name="snippet" />}
            aria-label={t`Create new snippet`}
          >
            {t`New snippet`}
          </Menu.Item>
          {PLUGIN_SNIPPET_FOLDERS.isEnabled && (
            <Menu.Item
              leftSection={<FixedSizeIcon name="folder" />}
              onClick={() => setCreatingSnippetFolder(true)}
            >
              {t`New snippet folder`}
            </Menu.Item>
          )}
        </Menu.Dropdown>
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
