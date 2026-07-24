import cx from "classnames";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { t } from "ttag";

import {
  useCancelExplorationThreadMutation,
  useRestartExplorationThreadMutation,
  useSetPagesHiddenMutation,
} from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import type {
  ITreeNodeItem,
  TreeNodeProps,
} from "metabase/common/components/tree/types";
import { useToast } from "metabase/common/hooks";
import {
  trackExplorationRestarted,
  trackExplorationStopped,
  trackExplorationVisualizationChanged,
} from "metabase/explorations/analytics";
import { useCopyLink } from "metabase/explorations/hooks/useCopyLink";
import {
  ActionIcon,
  Box,
  Ellipsified,
  Icon,
  type IconProps,
  Menu,
} from "metabase/ui";
import {
  type ExplorationId,
  type ExplorationPageNodeId,
  type ExplorationQueryStatus,
  type ExplorationThreadId,
  isRestartableExplorationThreadStatus,
  isSettledExplorationQueryStatus,
  isTerminalExplorationThreadStatus,
} from "metabase-types/api";

import { ExplorationErrorMarker } from "./ExplorationErrorMarker";
import { ExplorationLastActivity } from "./ExplorationLastActivity";
import S from "./ExplorationTreeNode.module.css";
import {
  type ExplorationHeadingKind,
  type ExplorationTreeHeading,
  type ExplorationTreeNode,
  type ExplorationTreePage,
  getShimmerDelayStyle,
  pickInitialSidebarPage,
} from "./utils";

const HEADING_ICON: Record<
  ExplorationHeadingKind,
  { name: IconProps["name"]; color: IconProps["c"] }
> = {
  root: { name: "insight", color: "brand" },
  "sub-exploration": { name: "git_branch", color: "brand" },
  "metric-group": { name: "metric", color: "text-secondary" },
};

export interface ExplorationTreeContextValue {
  explorationId: ExplorationId;
  canWrite: boolean;
  handlePrefetch: (item: ITreeNodeItem<ExplorationTreeNode>) => void;
  shouldScrollSelectionRef: React.MutableRefObject<boolean>;
  getSelectedPageUrl: (pageId: ExplorationPageNodeId) => string;
  readPageIds: ReadonlySet<string>;
}

export const ExplorationTreeContext =
  createContext<ExplorationTreeContextValue | null>(null);

interface ExplorationTreeNodeProps
  extends TreeNodeProps<ExplorationTreeNode>, ExplorationTreeContextValue {}

export function ExplorationTreeNode(props: TreeNodeProps<ExplorationTreeNode>) {
  const treeContext = useContext(ExplorationTreeContext);
  if (treeContext == null) {
    return null;
  }
  const nodeProps = { ...props, ...treeContext };
  if (isExplorationTreeHeadingProps(nodeProps)) {
    return <ExplorationTreeHeading {...nodeProps} />;
  }
  if (isExplorationTreeItemProps(nodeProps)) {
    return <ExplorationTreeItem {...nodeProps} />;
  }
  return null;
}

interface ExplorationTreeHeadingProps extends ExplorationTreeNodeProps {
  item: ITreeNodeItem<ExplorationTreeHeading>;
}

function isSettled(status: ExplorationQueryStatus | undefined): boolean {
  return status == null || isSettledExplorationQueryStatus(status);
}

function isLoadingStatus(status: ExplorationQueryStatus | undefined): boolean {
  return status != null && !isSettledExplorationQueryStatus(status);
}

function isExplorationTreeHeadingProps(
  props: ExplorationTreeNodeProps,
): props is ExplorationTreeHeadingProps {
  return props.item.data?.type === "heading";
}

function ExplorationTreeHeading({
  item,
  isExpanded,
  hasChildren,
  onToggleExpand,
  depth,
  explorationId,
  canWrite,
  getSelectedPageUrl,
}: ExplorationTreeHeadingProps) {
  const isLoading = isLoadingStatus(item.data?.status);
  // Only the retained initial-investigation heading can be childless (pruning
  // drops every other empty heading). The tree controller can't expand a node
  // without children, so force the expanded look: the all-hidden note beneath
  // then reads as the group's content rather than a collapsed group.
  const displayExpanded = isExpanded || !hasChildren;
  return (
    <Box
      role="group"
      aria-label={item.name}
      aria-expanded={displayExpanded}
      aria-busy={isLoading}
      className={cx(S.treeRow, S.treeRowHeading, {
        [S.treeRowNested]: depth > 0,
        [S.treeRowThreadSeparated]:
          depth === 0 && item.data?.headingKind === "sub-exploration",
      })}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onToggleExpand();
          e.preventDefault();
        }
      }}
      onClick={onToggleExpand}
      style={{ "--tree-depth": depth }}
    >
      <Box className={S.treeChevron} aria-hidden>
        <Icon
          name={displayExpanded ? "chevrondown" : "chevronright"}
          size={12}
          c="text-tertiary"
        />
      </Box>
      <ExplorationHeadingIcon
        headingKind={item.data?.headingKind}
        status={item.data?.status}
      />
      <Ellipsified
        flex={1}
        size="md"
        lh="1rem"
        fw={500}
        {...(isLoading
          ? {
              className: S.shimmerText,
              c: "transparent",
              style: getShimmerDelayStyle(item.id),
            }
          : {})}
      >
        {item.name}
      </Ellipsified>
      {item.data?.lastActivityAt && isSettled(item.data.status) && (
        <ExplorationLastActivity lastActivityAt={item.data.lastActivityAt} />
      )}
      <ExplorationGroupMenu
        item={item}
        canWrite={canWrite}
        explorationId={explorationId}
        getSelectedPageUrl={getSelectedPageUrl}
      />
    </Box>
  );
}

function ExplorationGroupMenu({
  item,
  canWrite,
  explorationId,
  getSelectedPageUrl,
}: {
  item: ITreeNodeItem<ExplorationTreeHeading>;
  canWrite: boolean;
  explorationId: ExplorationId;
  getSelectedPageUrl: (pageId: ExplorationPageNodeId) => string;
}) {
  const [cancelThread] = useCancelExplorationThreadMutation();
  const [restartExplorationThread] = useRestartExplorationThreadMutation();
  const [setPagesHidden] = useSetPagesHiddenMutation();
  const [sendToast] = useToast();
  const copyLink = useCopyLink();

  const groupName = item.name;
  const itemPageIds = item.data?.pageIds;
  const pageIds = useMemo(() => itemPageIds ?? [], [itemPageIds]);
  // when the whole group is already hidden, the action shows it again
  const allHidden = item.data?.allHidden === true;
  const canHideGroup =
    canWrite && item.data?.hideable === true && pageIds.length > 0;

  const handleToggleGroupHidden = useCallback(async () => {
    const nextHidden = !allHidden;
    try {
      await setPagesHidden({
        pageIds,
        explorationId,
        hidden: nextHidden,
      }).unwrap();
    } catch {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "warning",
        message: t`Failed to update ${groupName}`,
      });
      return;
    }
    if (nextHidden) {
      sendToast({
        icon: "eye_crossed_out",
        message: t`${groupName} hidden`,
        actionLabel: t`Undo`,
        actions: [
          () => setPagesHidden({ pageIds, explorationId, hidden: false }),
        ],
      });
    }
  }, [setPagesHidden, pageIds, explorationId, groupName, allHidden, sendToast]);

  const handleCopyLink = useCallback(() => {
    const page = pickInitialSidebarPage(item.children ?? []);
    if (page == null) {
      return;
    }
    copyLink(`${window.location.origin}${getSelectedPageUrl(page)}`);
  }, [item.children, getSelectedPageUrl, copyLink]);

  const handleCancelThread = useCallback(
    async (explorationId: ExplorationId, threadId: ExplorationThreadId) => {
      const { error } = await cancelThread({ explorationId, threadId });
      if (error) {
        sendToast({
          message: t`Failed to stop`,
          icon: "warning_triangle_filled",
          iconColor: "warning",
        });
        return;
      }
      trackExplorationStopped(explorationId);
    },
    [cancelThread, sendToast],
  );

  const handleRestart = useCallback(
    async (explorationId: ExplorationId, threadId: ExplorationThreadId) => {
      const { error } = await restartExplorationThread({
        explorationId,
        threadId,
      });
      if (error) {
        sendToast({
          message: t`Failed to restart`,
          icon: "warning_triangle_filled",
          iconColor: "warning",
        });
        return;
      }
      trackExplorationRestarted(explorationId);
    },
    [restartExplorationThread, sendToast],
  );

  const thread = item.data?.thread;
  const canStop =
    canWrite &&
    thread != null &&
    !isTerminalExplorationThreadStatus(thread.status);
  const canRestart =
    canWrite &&
    thread != null &&
    isRestartableExplorationThreadStatus(thread.status);

  return (
    <Menu>
      <Menu.Target>
        <ActionIcon
          className={S.groupMenuTrigger}
          size="1rem"
          c="icon-primary"
          aria-label={t`Group actions`}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="ellipsis" size="1rem" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
        <Menu.Item leftSection={<Icon name="link" />} onClick={handleCopyLink}>
          {t`Copy link`}
        </Menu.Item>
        {canHideGroup && (
          <Menu.Item
            leftSection={<Icon name={allHidden ? "eye" : "eye_crossed_out"} />}
            onClick={handleToggleGroupHidden}
          >
            {allHidden ? t`Show` : t`Hide`}
          </Menu.Item>
        )}
        {canStop && (
          <Menu.Item
            onClick={() => handleCancelThread(explorationId, thread.id)}
          >
            {t`Stop running`}
          </Menu.Item>
        )}
        {canRestart && (
          <Menu.Item onClick={() => handleRestart(explorationId, thread.id)}>
            {t`Restart`}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

interface ExplorationTreeItemProps extends ExplorationTreeNodeProps {
  item: ITreeNodeItem<ExplorationTreePage>;
}

function isExplorationTreeItemProps(
  props: ExplorationTreeNodeProps,
): props is ExplorationTreeItemProps {
  return props.item.data?.type === "page";
}

function ExplorationTreeItem({
  item,
  isSelected,
  depth,
  explorationId,
  handlePrefetch,
  shouldScrollSelectionRef,
  getSelectedPageUrl,
  readPageIds,
}: ExplorationTreeItemProps) {
  const itemRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (isSelected && shouldScrollSelectionRef.current) {
      itemRef.current?.scrollIntoView({
        block: "nearest",
      });
      shouldScrollSelectionRef.current = false;
    }
  }, [isSelected, shouldScrollSelectionRef]);

  const handleClick = useCallback(() => {
    if (!isSelected && item.data?.type === "page") {
      trackExplorationVisualizationChanged(explorationId, "click");
    }
  }, [isSelected, item.data, explorationId]);

  if (!item.data) {
    return null;
  }

  const pageId = item.data.page_id;

  const iconProps: IconProps = {
    color: isSelected ? "brand" : "icon-secondary",
    name: typeof item.icon === "string" ? item.icon : item.icon.name,
  };

  const pageData = item.data.type === "page" ? item.data : null;
  const isError = pageData?.status === "error";
  const isHidden = pageData?.hidden === true;
  const isLoading = isLoadingStatus(item.data?.status);
  const isUnread = pageData != null && !readPageIds.has(pageData.page_id);

  return (
    <ForwardRefLink
      ref={itemRef}
      to={getSelectedPageUrl(pageId)}
      role="treeitem"
      aria-selected={isSelected}
      aria-busy={isLoading}
      className={cx(S.treeRow, {
        [S.treeRowSelected]: isSelected,
        [S.treeRowNested]: depth > 0,
      })}
      onMouseEnter={() => handlePrefetch(item)}
      onClick={handleClick}
      // custom css var used for tree styles
      style={{ "--tree-depth": depth } as React.CSSProperties}
    >
      <ExplorationTreeItemIcon
        status={item.data?.status}
        iconProps={iconProps}
      />
      <Ellipsified
        flex={1}
        size="md"
        lh="1rem"
        fw={isUnread ? 700 : 500}
        {...(isLoading
          ? {
              className: S.shimmerText,
              c: "transparent",
              style: getShimmerDelayStyle(item.id),
            }
          : {})}
      >
        {item.name}
      </Ellipsified>
      {isHidden && (
        <Icon
          name="eye_crossed_out"
          c="icon-secondary"
          size="1rem"
          flex="none"
          tooltip={t`Hidden`}
          aria-label={t`Hidden`}
        />
      )}
      {isError && (
        <ExplorationErrorMarker
          message={t`We couldn't generate one or more of these charts.`}
        />
      )}
    </ForwardRefLink>
  );
}

function ExplorationHeadingIcon({
  headingKind,
  status,
}: {
  headingKind: ExplorationHeadingKind | undefined;
  status: ExplorationQueryStatus | undefined;
}) {
  if (status === "canceled") {
    return (
      <Icon name="octagon_alert" c="icon-primary" aria-label={t`Stopped`} />
    );
  }
  if (headingKind == null) {
    return null;
  }
  const { name, color } = HEADING_ICON[headingKind];
  return <Icon name={name} c={color} aria-hidden />;
}

function ExplorationTreeItemIcon({
  status,
  iconProps,
}: {
  status: ExplorationQueryStatus | undefined;
  iconProps: IconProps;
}) {
  if (status === "canceled") {
    return (
      <Icon name="octagon_alert" c="icon-primary" aria-label={t`Stopped`} />
    );
  }

  if (status === "error" || isLoadingStatus(status)) {
    return <Icon {...iconProps} aria-hidden />;
  }

  return <Icon {...iconProps} aria-label={t`Ready`} />;
}
