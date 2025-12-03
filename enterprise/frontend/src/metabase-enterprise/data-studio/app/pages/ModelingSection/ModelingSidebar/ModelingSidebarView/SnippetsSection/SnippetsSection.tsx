import { useCallback, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useListCollectionsQuery, useListSnippetsQuery } from "metabase/api";
import { isRootCollection } from "metabase/collections/utils";
import { ForwardRefLink } from "metabase/common/components/Link";
import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Button, FixedSizeIcon, Flex, Menu, Tooltip } from "metabase/ui";
import type { Collection, CollectionId } from "metabase-types/api";

import { ModelingSidebarTreeNode } from "../../ModelingSidebarTreeNode";

import {
  type TreeItem,
  buildSnippetTree,
  isCollectionTreeItem,
  isSnippetTreeItem,
} from "./utils";

type SnippetsSectionProps = {
  selectedSnippetId?: number;
};

export function SnippetsSection({ selectedSnippetId }: SnippetsSectionProps) {
  const dispatch = useDispatch();
  const isAdmin = useSelector(getUserIsAdmin);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(
    null,
  );
  const [permissionsCollectionId, setPermissionsCollectionId] =
    useState<CollectionId | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);

  const { data: snippets = [] } = useListSnippetsQuery();
  const { data: snippetCollections = [] } = useListCollectionsQuery({
    namespace: "snippets",
  });

  const snippetTree = useMemo(
    () => buildSnippetTree(snippetCollections, snippets),
    [snippetCollections, snippets],
  );

  const handleSnippetSelect = useCallback(
    (item: ITreeNodeItem<TreeItem>) => {
      if (item.data && isSnippetTreeItem(item.data)) {
        dispatch(push(Urls.dataStudioSnippet(item.data.id)));
      }
    },
    [dispatch],
  );

  return (
    <>
      <Tree
        data={snippetTree}
        selectedId={selectedSnippetId}
        onSelect={handleSnippetSelect}
        TreeNode={ModelingSidebarTreeNode}
        rightSection={(item: ITreeNodeItem<TreeItem>) => {
          if (!item.data || !isCollectionTreeItem(item.data)) {
            return null;
          }

          const isRoot = isRootCollection(item.data);

          if (isRoot) {
            return (
              <Flex
                gap="xs"
                align="center"
                onClick={(e) => e.stopPropagation()}
              >
                {isAdmin && (
                  <Menu position="bottom-end">
                    <Menu.Target>
                      <Button
                        w={24}
                        h={24}
                        c="text-medium"
                        size="compact-xs"
                        variant="subtle"
                        leftSection={
                          <FixedSizeIcon name="ellipsis" size={16} />
                        }
                        aria-label={t`Snippet collection options`}
                      />
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item
                        leftSection={<FixedSizeIcon name="lock" />}
                        onClick={() => {
                          if (item.data) {
                            setPermissionsCollectionId(item.data.id);
                          }
                        }}
                      >
                        {t`Change permissions`}
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                )}
                {item.data.can_write && (
                  <Menu position="bottom-end">
                    <Tooltip label={t`Create snippet`}>
                      <Menu.Target>
                        <Button
                          w={24}
                          h={24}
                          size="compact-xs"
                          variant="subtle"
                          c="text-medium"
                          leftSection={<FixedSizeIcon name="add" size={16} />}
                          aria-label={t`Create snippet`}
                        />
                      </Menu.Target>
                    </Tooltip>
                    <Menu.Dropdown>
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
                          onClick={() => setCreatingFolder(true)}
                        >
                          {t`New folder`}
                        </Menu.Item>
                      )}
                    </Menu.Dropdown>
                  </Menu>
                )}
              </Flex>
            );
          }

          return (
            <PLUGIN_SNIPPET_FOLDERS.CollectionMenu
              collection={item.data}
              onEditDetails={setEditingCollection}
              onChangePermissions={setPermissionsCollectionId}
            />
          );
        }}
        role="tree"
        aria-label="modeling-snippets-tree"
      />
      {editingCollection && (
        <PLUGIN_SNIPPET_FOLDERS.CollectionFormModal
          collection={editingCollection}
          onClose={() => setEditingCollection(null)}
          onSaved={() => setEditingCollection(null)}
        />
      )}
      {creatingFolder && (
        <PLUGIN_SNIPPET_FOLDERS.CollectionFormModal
          collection={{
            name: "",
            description: null,
          }}
          onClose={() => setCreatingFolder(false)}
          onSaved={() => setCreatingFolder(false)}
        />
      )}
      {permissionsCollectionId != null && (
        <PLUGIN_SNIPPET_FOLDERS.CollectionPermissionsModal
          collectionId={permissionsCollectionId}
          onClose={() => setPermissionsCollectionId(null)}
        />
      )}
    </>
  );
}
