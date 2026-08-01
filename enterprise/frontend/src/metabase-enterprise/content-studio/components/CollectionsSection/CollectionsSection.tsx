import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useCallback } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import type { CollectionTreeItem } from "metabase/common/collections/utils";
import { CollapseSection } from "metabase/common/components/CollapseSection";
import { Link } from "metabase/common/components/Link";
import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { useSelector } from "metabase/redux";
import { useLocation } from "metabase/router";
import {
  ActionIcon,
  Anchor,
  Center,
  Icon,
  Loader,
  Text,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { CollectionSyncStatusBadge } from "metabase-enterprise/remote_sync/components/CollectionSyncStatusBadge";
import { useRemoteSyncDirtyState } from "metabase-enterprise/remote_sync/hooks/use-remote-sync-dirty-state";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type { CollectionId } from "metabase-types/api";

import {
  type ContentStudioCollectionNode,
  useScopeCollectionTree,
} from "../../collection-tree";
import { useContentStudioScope } from "../../scope";
import { useIsScopeImporting } from "../../sync-state";
import { ContentStudioTreeNode } from "../ContentStudioTreeNode";

const REMOTE_SYNC_SETTINGS_PATH = "/admin/settings/remote-sync";

type CollectionsSectionProps = {
  onNewCollection?: () => void;
};

/** The collections of the branch the studio is scoped to, as an expandable tree. */
export function CollectionsSection({
  onNewCollection,
}: CollectionsSectionProps) {
  const { worktreeId } = useContentStudioScope();
  const { nodes, isLoading } = useScopeCollectionTree();
  const isImporting = useIsScopeImporting();
  const isReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const { pathname } = useLocation();
  const {
    value: isExpanded,
    setValue: setExpanded,
    isLoading: isLoadingExpandedState,
  } = useUserKeyValue({
    namespace: "content_studio",
    key: "areCollectionsExpanded",
    defaultValue: true,
  });

  const { isCollectionDirty } = useRemoteSyncDirtyState();
  const isMainScope = worktreeId == null;
  // Read-only sync protects the instance's own branch; a checked-out branch is
  // an admin's working copy and stays editable.
  const canCreateCollection = !isMainScope || !isReadOnly;

  const renderSyncBadge = useCallback(
    (item: ITreeNodeItem<CollectionTreeItem>) =>
      isMainScope && isCollectionDirty(item.id) ? (
        <CollectionSyncStatusBadge />
      ) : null,
    [isCollectionDirty, isMainScope],
  );

  // `CollapseSection` latches `initialState` at mount, so the section can only
  // be mounted once the stored preference is known.
  if (isLoadingExpandedState) {
    return null;
  }

  return (
    <ErrorBoundary>
      <CollapseSection
        header={
          <Text
            component={Link}
            to={Urls.contentStudioCollections(
              worktreeId != null ? { worktreeId } : {},
            )}
            c="text-secondary"
            fz="11px"
            fw={700}
            lts="0.45px"
            tt="uppercase"
            // The surrounding header toggles the section on click and on Enter;
            // the title navigates instead, whether reached by mouse or keyboard.
            onClick={(event: MouseEvent) => event.stopPropagation()}
            onKeyDown={(event: KeyboardEvent) => {
              if (event.key === "Enter") {
                event.stopPropagation();
              }
            }}
          >
            {t`Collections`}
          </Text>
        }
        initialState={isExpanded ? "expanded" : "collapsed"}
        iconPosition="right"
        iconSize={8}
        onToggle={setExpanded}
        rightAction={
          onNewCollection && canCreateCollection ? (
            <Tooltip label={t`Create a new collection`}>
              <ActionIcon
                aria-label={t`Create a new collection`}
                color="text-secondary"
                onClick={onNewCollection}
              >
                <Icon name="add" />
              </ActionIcon>
            </Tooltip>
          ) : null
        }
      >
        <CollectionsTree
          isLoading={isLoading || isImporting}
          isMainScope={isMainScope}
          nodes={nodes}
          selectedId={Urls.extractContentStudioCollectionIdFromPath(pathname)}
          renderSyncBadge={renderSyncBadge}
        />
      </CollapseSection>
    </ErrorBoundary>
  );
}

type CollectionsTreeProps = {
  isLoading: boolean;
  isMainScope: boolean;
  nodes: ContentStudioCollectionNode[];
  selectedId: CollectionId | undefined;
  renderSyncBadge: (item: ITreeNodeItem<CollectionTreeItem>) => ReactNode;
};

function CollectionsTree({
  isLoading,
  isMainScope,
  nodes,
  selectedId,
  renderSyncBadge,
}: CollectionsTreeProps) {
  if (isLoading) {
    return (
      <Center py="sm">
        <Loader size="xs" data-testid="loading-indicator" />
      </Center>
    );
  }

  if (nodes.length === 0) {
    return (
      <Text c="text-secondary" fz="sm" px="sm">
        {isMainScope ? (
          <>
            {t`No collections are synced yet.`}{" "}
            <Anchor component={Link} to={REMOTE_SYNC_SETTINGS_PATH} fz="sm">
              {t`Choose what to sync`}
            </Anchor>
          </>
        ) : (
          t`No content. Pull to load this branch.`
        )}
      </Text>
    );
  }

  return (
    <Tree
      data={nodes}
      selectedId={selectedId}
      TreeNode={ContentStudioTreeNode}
      role="tree"
      aria-label={t`Collections`}
      rightSection={renderSyncBadge}
    />
  );
}
