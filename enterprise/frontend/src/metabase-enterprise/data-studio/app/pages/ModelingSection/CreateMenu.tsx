import { t } from "ttag";

import { Button, FixedSizeIcon, Icon, Loader, Menu } from "metabase/ui";
import { ForwardRefLink } from "metabase/common/components/Link";

import * as Urls from "metabase/lib/urls";
import { useListDatabasesQuery } from "metabase/api";
import { getHasDataAccess, getHasNativeWrite } from "metabase/selectors/data";
import { useMemo, useState } from "react";
import { CollectionId } from "metabase-types/api";
import { PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";

export const CreateMenu = ({
  modelCollectionId,
  metricCollectionId,
}: {
  modelCollectionId?: CollectionId;
  metricCollectionId?: CollectionId;
}) => {
  const [creatingSnippetFolder, setCreatingSnippetFolder] = useState(false);

  const { data: databaseData, isLoading: isLoadingDatabases } =
    useListDatabasesQuery();

  const { hasDataAccess, hasNativeWrite } = useMemo(() => {
    const databases = databaseData?.data ?? [];
    return {
      hasDataAccess: getHasDataAccess(databases),
      hasNativeWrite: getHasNativeWrite(databases),
    };
  }, [databaseData]);

  const canCreateModel = hasDataAccess && modelCollectionId;
  const canCreateMetric = hasDataAccess && metricCollectionId;
  const canCreateNativeQuery = hasNativeWrite && modelCollectionId;

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button
            leftSection={isLoadingDatabases ? <Loader /> : <Icon name="add" />}
          >{t`New`}</Button>
        </Menu.Target>
        <Menu.Dropdown>
          {canCreateModel && canCreateNativeQuery && (
            <Menu.Sub>
              <Menu.Sub.Target>
                <Menu.Sub.Item leftSection={<FixedSizeIcon name="model" />}>
                  {t`Model`}
                </Menu.Sub.Item>
              </Menu.Sub.Target>
              <Menu.Sub.Dropdown>
                <Menu.Item
                  component={ForwardRefLink}
                  to={Urls.newDataStudioQueryModel({
                    collectionId: modelCollectionId,
                  })}
                  leftSection={<FixedSizeIcon name="notebook" />}
                >
                  {t`Query builder`}
                </Menu.Item>
                <Menu.Item
                  component={ForwardRefLink}
                  to={Urls.newDataStudioNativeModel({
                    collectionId: modelCollectionId,
                  })}
                  leftSection={<FixedSizeIcon name="sql" />}
                >
                  {t`SQL query`}
                </Menu.Item>
              </Menu.Sub.Dropdown>
            </Menu.Sub>
          )}
          {canCreateModel && !canCreateNativeQuery && (
            <Menu.Item
              component={ForwardRefLink}
              to={Urls.newDataStudioQueryModel({
                collectionId: modelCollectionId,
              })}
              leftSection={<FixedSizeIcon name="model" />}
            >
              {t`Model`}
            </Menu.Item>
          )}
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
