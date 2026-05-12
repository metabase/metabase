import cx from "classnames";
import {
  type Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import {
  Ellipsified,
  Icon,
  Loader,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type {
  Exploration,
  ExplorationDocument,
  ExplorationQueryGroup,
  ExplorationQueryGroupId,
  ExplorationQueryGroupStatus,
  ExplorationQueryId,
  ExplorationQueryStatus,
  ExplorationQueryWithName,
  ExplorationThread,
  ThreadsWithSortedQueries,
} from "metabase-types/api";
import {
  getExplorationQueryGroupInterestingness,
  getExplorationQueryGroupStatus,
} from "metabase-types/api";

import type { SelectedEntityId } from "../../pages/ExplorationPage";
import { shouldIgnoreKeyboardEvent } from "../../utils";
import { PotentiallyInterestingMarker } from "../PotentiallyInterestingMarker";

import S from "./ExplorationSidebar.module.css";

/**
 * A row that arrow-key navigation can land on. Either a single query
 * (singleton group's query, sidebar group's expanded child, or an
 * ungrouped query) or a `page` group's row. `groupId` is the
 * collapsible (`display_type: "sidebar"`) group the query belongs to,
 * or `null` if the query is rendered flat — this drives auto-open /
 * auto-close behavior when navigation crosses a group boundary.
 */
type NavEntity =
  | {
      type: "query";
      id: ExplorationQueryId;
      groupId: ExplorationQueryGroupId | null;
    }
  | { type: "group"; id: ExplorationQueryGroupId };

interface ExplorationSidebarProps {
  exploration: Exploration;
  selectedEntityId: SelectedEntityId | null;
  setSelectedEntityId: (entityId: SelectedEntityId) => void;
  threadsWithSortedQueries: ThreadsWithSortedQueries[];
}

const INTERESTINGNESS_SCORE_THRESHOLD = 0.7;

export const AUTO_INSIGHTS_DOCUMENT_NAME = "Automatic Insights";

export function ExplorationSidebar({
  exploration,
  selectedEntityId,
  setSelectedEntityId,
  threadsWithSortedQueries,
}: ExplorationSidebarProps) {
  const selectedRowRef = useRef<HTMLButtonElement | null>(null);

  const selectedQueryId =
    selectedEntityId?.type === "query" ? selectedEntityId.id : null;
  const selectedGroupId =
    selectedEntityId?.type === "group" ? selectedEntityId.id : null;

  const setSelectedQueryId = useCallback(
    (queryId: ExplorationQueryId) => {
      return setSelectedEntityId({ id: queryId, type: "query" });
    },
    [setSelectedEntityId],
  );

  const setSelectedGroupId = useCallback(
    (groupId: ExplorationQueryGroupId) => {
      return setSelectedEntityId({ id: groupId, type: "group" });
    },
    [setSelectedEntityId],
  );

  // Track which multi-query groups are currently expanded. Lives at the
  // sidebar level so the arrow-key handler can collapse the source group and
  // expand the destination atomically when navigation crosses a boundary.
  // Group ids are globally unique (`auto:<card_id>:<dimension_id>`), so a flat
  // Set covers all threads.
  const [openGroupIds, setOpenGroupIds] = useState<
    ReadonlySet<ExplorationQueryGroupId>
  >(() => new Set());

  // Anchor the selected row's scroll position so it stays put when the
  // list shifts under it (e.g. as polling brings in interestingness
  // scores and the sort order changes mid-flight). Also subsumes the
  // "scroll new selection into view" behavior on selection change.
  //
  // Uses `useLayoutEffect` so the adjustment runs synchronously after
  // the DOM update and BEFORE the browser paints — no flicker.
  const lastAnchorIdRef = useRef<string | null>(null);
  const lastAnchorTopRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const row = selectedRowRef.current;
    const currentId =
      selectedEntityId?.type === "query" || selectedEntityId?.type === "group"
        ? `${selectedEntityId.type}-${String(selectedEntityId.id)}`
        : null;

    if (!row || !currentId) {
      lastAnchorIdRef.current = null;
      lastAnchorTopRef.current = null;
      return;
    }

    const scrollParent = findScrollableAncestor(row);
    if (!scrollParent) {
      lastAnchorIdRef.current = currentId;
      lastAnchorTopRef.current = null;
      return;
    }

    const measureTop = () =>
      row.getBoundingClientRect().top -
      scrollParent.getBoundingClientRect().top;

    const isSameSelection = lastAnchorIdRef.current === currentId;

    if (!isSameSelection) {
      // New selection (initial mount or user picked a different row).
      // Bring it into view, then capture the post-scroll anchor for
      // the next render's delta calculation.
      row.scrollIntoView({ block: "nearest" });
      lastAnchorTopRef.current = measureTop();
      lastAnchorIdRef.current = currentId;
      return;
    }

    // Same selection — list reordered under it. If the row's relative
    // top within the scroll container changed, compensate by adjusting
    // scrollTop so the row stays at the same visual position.
    const currentTop = measureTop();
    if (
      lastAnchorTopRef.current !== null &&
      currentTop !== lastAnchorTopRef.current
    ) {
      scrollParent.scrollTop += currentTop - lastAnchorTopRef.current;
      // After the adjustment, the row's relative top equals the
      // previous anchor; ref stays valid for subsequent updates.
    } else {
      lastAnchorTopRef.current = currentTop;
    }
  });

  // Visual-order list of *navigable entities* — the rows arrow-keys walk
  // through. A row is either a single query (singleton group's query, a
  // sidebar group's expanded child, or an ungrouped query) or a `page`
  // group's row. Entities carry the `groupId` of the collapsible block
  // they belong to (sidebar-type) so the keydown handler can open/close
  // groups when navigation crosses a boundary.
  const orderedNavEntities = useMemo<NavEntity[]>(() => {
    return threadsWithSortedQueries.flatMap((thread) => {
      const queriesById = new Map(thread.queries.map((q) => [q.id, q]));
      const sortedGroups = (thread.groups ?? [])
        .slice()
        .sort((a, b) => a.position - b.position);
      const groupedIds = new Set<ExplorationQueryId>();
      const groupedFlat = sortedGroups.flatMap((group): NavEntity[] => {
        switch (group.display_type) {
          case "page":
            // The page group exposes itself as a single entity; its
            // queries are reachable only via the group, not individually.
            for (const id of group.query_ids) {
              groupedIds.add(id);
            }
            return [{ type: "group", id: group.id }];
          case "sidebar":
            return group.query_ids
              .map((id): NavEntity | null => {
                groupedIds.add(id);
                const q = queriesById.get(id);
                return q
                  ? { type: "query", id: q.id, groupId: group.id }
                  : null;
              })
              .filter((e): e is NavEntity => e != null);
          case "singleton":
            return group.query_ids
              .map((id): NavEntity | null => {
                groupedIds.add(id);
                const q = queriesById.get(id);
                return q ? { type: "query", id: q.id, groupId: null } : null;
              })
              .filter((e): e is NavEntity => e != null);
        }
      });
      const ungrouped: NavEntity[] = thread.queries
        .filter((q) => !groupedIds.has(q.id))
        .map((q) => ({ type: "query", id: q.id, groupId: null }));
      return [...groupedFlat, ...ungrouped];
    });
  }, [threadsWithSortedQueries]);

  // Look up which collapsible group (if any) a query belongs to. Used to
  // detect a group-boundary crossing during arrow-key navigation. Only
  // `display_type: "sidebar"` groups are collapsible; singleton groups
  // render flat, and page groups don't expose their queries at all.
  const queryIdToGroupId = useMemo(() => {
    const map = new Map<ExplorationQueryId, ExplorationQueryGroupId>();
    for (const thread of threadsWithSortedQueries) {
      for (const group of thread.groups ?? []) {
        if (group.display_type !== "sidebar") {
          continue;
        }
        for (const id of group.query_ids) {
          map.set(id, group.id);
        }
      }
    }
    return map;
  }, [threadsWithSortedQueries]);

  // Whenever the selected query changes, ensure its group is open.
  useEffect(() => {
    if (selectedQueryId == null) {
      return;
    }
    const groupId = queryIdToGroupId.get(selectedQueryId);
    if (!groupId) {
      return;
    }
    setOpenGroupIds((prev) => {
      if (prev.has(groupId)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(groupId);
      return next;
    });
  }, [selectedQueryId, queryIdToGroupId]);

  // Arrow-key navigation. Walks navigable entities (queries and `page`
  // groups) in sidebar order; when crossing a `sidebar`-type group's
  // boundary, collapses the source and opens the destination.
  // Bound to Left/Right because TimelineDropdown owns Up/Down (see
  // ExplorationPage.tsx for the original comment about that constraint).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Engage when sitting on any navigable entity. Documents are the
      // only entity type we don't traverse via arrows — they live in a
      // separate visual section of the sidebar.
      if (selectedEntityId == null || selectedEntityId.type === "document") {
        return;
      }
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
        return;
      }
      if (shouldIgnoreKeyboardEvent(event)) {
        return;
      }
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const currentIndex = orderedNavEntities.findIndex(
        (e) => e.type === selectedEntityId.type && e.id === selectedEntityId.id,
      );
      if (currentIndex === -1) {
        return;
      }
      const nextIndex = currentIndex + direction;
      if (nextIndex < 0 || nextIndex >= orderedNavEntities.length) {
        return;
      }
      const nextEntity = orderedNavEntities[nextIndex];
      event.preventDefault();

      const currentGroupId =
        selectedEntityId.type === "query"
          ? (queryIdToGroupId.get(selectedEntityId.id) ?? null)
          : null;
      const nextGroupId =
        nextEntity.type === "query" ? nextEntity.groupId : null;

      if (currentGroupId && currentGroupId !== nextGroupId) {
        setOpenGroupIds((prev) => {
          const next = new Set(prev);
          next.delete(currentGroupId);
          if (nextGroupId) {
            next.add(nextGroupId);
          }
          return next;
        });
      } else if (nextGroupId && nextGroupId !== currentGroupId) {
        setOpenGroupIds((prev) =>
          prev.has(nextGroupId) ? prev : new Set(prev).add(nextGroupId),
        );
      }

      if (nextEntity.type === "group") {
        setSelectedGroupId(nextEntity.id);
      } else {
        setSelectedQueryId(nextEntity.id);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    orderedNavEntities,
    queryIdToGroupId,
    selectedEntityId,
    setSelectedQueryId,
    setSelectedGroupId,
  ]);

  const handleToggleGroup = useCallback(
    (group: ExplorationQueryGroup) => {
      setOpenGroupIds((prev) => {
        const next = new Set(prev);
        if (next.has(group.id)) {
          next.delete(group.id);
        } else {
          next.add(group.id);
          const firstId = group.query_ids[0];
          if (firstId != null) {
            setSelectedQueryId(firstId);
          }
        }
        return next;
      });
    },
    [setSelectedQueryId],
  );

  return (
    <Stack h="100%" w="20%" flex="none" gap="lg" pt="3rem" mr="2rem">
      <Text size="xl" fw="bold">
        {exploration.name}
      </Text>
      {threadsWithSortedQueries.map((thread, i) => {
        return (
          <Stack
            key={thread.id}
            gap="xs"
            py="xs"
            pb="md"
            pl="xs"
            pr="md"
            className={S.threadList}
          >
            <Text fw="bold">{getExplorationThreadName(thread, i)}</Text>
            {thread.documents?.map((document) => (
              <ExplorationDocumentRow
                key={`document-${document.id}`}
                document={document}
                isSelected={
                  selectedEntityId?.type === "document" &&
                  selectedEntityId.id === document.id
                }
                isLoading={
                  document.name === AUTO_INSIGHTS_DOCUMENT_NAME &&
                  thread.started_at != null &&
                  thread.completed_at == null
                }
                onSelect={() =>
                  setSelectedEntityId({ type: "document", id: document.id })
                }
              />
            ))}
            <ExplorationThreadQueries
              thread={thread}
              selectedQueryId={selectedQueryId}
              setSelectedQueryId={setSelectedQueryId}
              selectedGroupId={selectedGroupId}
              setSelectedGroupId={setSelectedGroupId}
              selectedRowRef={selectedRowRef}
              openGroupIds={openGroupIds}
              onToggleGroup={handleToggleGroup}
            />
          </Stack>
        );
      })}
    </Stack>
  );
}

interface ExplorationThreadQueriesProps {
  thread: ThreadsWithSortedQueries;
  selectedQueryId: ExplorationQueryId | null;
  setSelectedQueryId: (queryId: ExplorationQueryId) => void;
  selectedGroupId: ExplorationQueryGroupId | null;
  setSelectedGroupId: (groupId: ExplorationQueryGroupId) => void;
  selectedRowRef: Ref<HTMLButtonElement>;
  openGroupIds: ReadonlySet<ExplorationQueryGroupId>;
  onToggleGroup: (group: ExplorationQueryGroup) => void;
}

function ExplorationThreadQueries({
  thread,
  selectedQueryId,
  setSelectedQueryId,
  selectedGroupId,
  setSelectedGroupId,
  selectedRowRef,
  openGroupIds,
  onToggleGroup,
}: ExplorationThreadQueriesProps) {
  const queriesById = useMemo(
    () => new Map(thread.queries.map((q) => [q.id, q])),
    [thread.queries],
  );

  const groups = useMemo(
    () => (thread.groups ?? []).slice().sort((a, b) => a.position - b.position),
    [thread.groups],
  );

  const groupedQueryIds = useMemo(() => {
    const ids = new Set<ExplorationQueryId>();
    for (const group of groups) {
      for (const id of group.query_ids) {
        ids.add(id);
      }
    }
    return ids;
  }, [groups]);

  const ungroupedQueries = useMemo(
    () => thread.queries.filter((q) => !groupedQueryIds.has(q.id)),
    [thread.queries, groupedQueryIds],
  );

  if (thread.queries.length === 0) {
    return <Text c="text-secondary">{t`No charts were generated.`}</Text>;
  }

  return (
    <Stack gap="xs" className={S.threadGroupList}>
      {groups.map((group) => {
        const groupQueries = group.query_ids
          .map((id) => queriesById.get(id))
          .filter((q): q is ExplorationQueryWithName => q != null);

        if (groupQueries.length === 0) {
          return null;
        }

        switch (group.display_type) {
          case "singleton": {
            // Render the lone query as a flat row — no group header.
            const query = groupQueries[0];
            const isSelected = selectedQueryId === query.id;
            return (
              <ExplorationQueryRow
                key={query.id}
                query={query}
                isSelected={isSelected}
                buttonRef={isSelected ? selectedRowRef : undefined}
                onSelect={() => setSelectedQueryId(query.id)}
              />
            );
          }

          case "page": {
            // Single sidebar row labeled with the group name; opens a
            // multi-chart page (`ExplorationGroupVisualization`).
            const isSelected = selectedGroupId === group.id;
            return (
              <ExplorationQueryGroupPageRow
                key={group.id}
                group={group}
                queries={groupQueries}
                isSelected={isSelected}
                buttonRef={isSelected ? selectedRowRef : undefined}
                onSelect={() => setSelectedGroupId(group.id)}
              />
            );
          }

          case "sidebar": {
            // Collapsible block with dropdown. The BE doesn't emit this
            // today, but it's reserved for future grouping heuristics.
            const isOpen = openGroupIds.has(group.id);
            return (
              <ExplorationQueryGroupBlock
                key={group.id}
                group={group}
                queries={groupQueries}
                isOpen={isOpen}
                onToggle={() => onToggleGroup(group)}
                selectedQueryId={selectedQueryId}
                setSelectedQueryId={setSelectedQueryId}
                selectedRowRef={selectedRowRef}
              />
            );
          }

          default: {
            // Exhaustiveness guard — adding a new `display_type` should
            // be a TS error here.
            const _exhaustive: never = group.display_type;
            void _exhaustive;
            return null;
          }
        }
      })}
      {ungroupedQueries.map((query) => (
        <ExplorationQueryRow
          key={query.id}
          query={query}
          isSelected={selectedQueryId === query.id}
          buttonRef={selectedQueryId === query.id ? selectedRowRef : undefined}
          onSelect={() => setSelectedQueryId(query.id)}
        />
      ))}
    </Stack>
  );
}

interface ExplorationQueryGroupBlockProps {
  group: ExplorationQueryGroup;
  queries: ExplorationQueryWithName[];
  isOpen: boolean;
  onToggle: () => void;
  selectedQueryId: ExplorationQueryId | null;
  setSelectedQueryId: (queryId: ExplorationQueryId) => void;
  selectedRowRef: Ref<HTMLButtonElement>;
}

function ExplorationQueryGroupBlock({
  group,
  queries,
  isOpen,
  onToggle,
  selectedQueryId,
  setSelectedQueryId,
  selectedRowRef,
}: ExplorationQueryGroupBlockProps) {
  const groupStatus = getExplorationQueryGroupStatus(queries);
  const groupInterestingness = getExplorationQueryGroupInterestingness(queries);
  const headerName = group.name ?? queries[0]?.name ?? t`Group`;

  return (
    <Stack gap="xs">
      <ExplorationQueryGroupRow
        name={headerName}
        status={groupStatus}
        interestingness={groupInterestingness}
        isOpen={isOpen}
        onToggle={onToggle}
      />
      {isOpen && (
        <Stack gap="xs" className={S.groupQueries}>
          {queries.map((query) => (
            <ExplorationQueryRow
              key={query.id}
              query={query}
              isSelected={selectedQueryId === query.id}
              buttonRef={
                selectedQueryId === query.id ? selectedRowRef : undefined
              }
              onSelect={() => setSelectedQueryId(query.id)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

interface ExplorationDocumentRowProps {
  document: ExplorationDocument;
  isSelected: boolean;
  isLoading: boolean;
  onSelect: () => void;
}

function ExplorationDocumentRow({
  document,
  isSelected,
  isLoading,
  onSelect,
}: ExplorationDocumentRowProps) {
  return (
    <UnstyledButton
      role="listitem"
      aria-pressed={isSelected}
      className={cx(S.queryRow, {
        [S.queryRowSelected]: isSelected,
      })}
      onClick={onSelect}
    >
      {isLoading ? (
        <Loader size="xs" aria-label={t`Generating analysis…`} />
      ) : (
        <Icon name="document" c="text-secondary" aria-label={t`Document`} />
      )}
      <Ellipsified flex={1} size="md" lh="1.5rem">
        {document.name}
      </Ellipsified>
    </UnstyledButton>
  );
}

interface ExplorationQueryGroupRowProps {
  name: string;
  status: ExplorationQueryGroupStatus;
  interestingness: number | null;
  isOpen: boolean;
  onToggle: () => void;
}

function ExplorationQueryGroupRow({
  name,
  status,
  interestingness,
  isOpen,
  onToggle,
}: ExplorationQueryGroupRowProps) {
  return (
    <UnstyledButton
      aria-expanded={isOpen}
      className={S.queryRow}
      onClick={onToggle}
    >
      <Icon
        name={isOpen ? "chevrondown" : "chevronright"}
        c="text-secondary"
        aria-hidden
      />
      <ExplorationQueryStatusIcon status={status} />
      <Ellipsified flex={1} size="md" lh="1.5rem">
        {name}
      </Ellipsified>
      {(interestingness ?? 0) > INTERESTINGNESS_SCORE_THRESHOLD && (
        <PotentiallyInterestingMarker />
      )}
    </UnstyledButton>
  );
}

interface ExplorationQueryGroupPageRowProps {
  group: ExplorationQueryGroup;
  queries: ExplorationQueryWithName[];
  isSelected: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  onSelect: () => void;
}

/**
 * Sidebar row for a `display_type: "page"` group: shows the group's name,
 * combined status icon, and combined interestingness badge — no chevron.
 * Clicking it opens the multi-chart page.
 */
function ExplorationQueryGroupPageRow({
  group,
  queries,
  isSelected,
  buttonRef,
  onSelect,
}: ExplorationQueryGroupPageRowProps) {
  const status = getExplorationQueryGroupStatus(queries);
  const interestingness = getExplorationQueryGroupInterestingness(queries);
  const name = group.name ?? queries[0]?.name ?? t`Group`;
  return (
    <UnstyledButton
      ref={buttonRef}
      role="listitem"
      aria-pressed={isSelected}
      className={cx(S.queryRow, {
        [S.queryRowSelected]: isSelected,
      })}
      onClick={onSelect}
    >
      <ExplorationQueryStatusIcon status={status} />
      <Ellipsified flex={1} size="md" lh="1.5rem">
        {name}
      </Ellipsified>
      {(interestingness ?? 0) > INTERESTINGNESS_SCORE_THRESHOLD && (
        <PotentiallyInterestingMarker />
      )}
    </UnstyledButton>
  );
}

interface ExplorationQueryRowProps {
  query: ExplorationQueryWithName;
  isSelected: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  onSelect: () => void;
}

function ExplorationQueryRow({
  query,
  isSelected,
  buttonRef,
  onSelect,
}: ExplorationQueryRowProps) {
  const errorMessage =
    query.status === "error" && query.error_message
      ? query.error_message
      : null;

  const row = (
    <UnstyledButton
      ref={buttonRef}
      role="listitem"
      aria-pressed={isSelected}
      className={cx(S.queryRow, {
        [S.queryRowSelected]: isSelected,
      })}
      onClick={onSelect}
    >
      <ExplorationQueryStatusIcon status={query.status} />
      <Ellipsified flex={1} size="md" lh="1.5rem">
        {query.name}
      </Ellipsified>
      {(query.interestingness_score ?? 0) > INTERESTINGNESS_SCORE_THRESHOLD && (
        <PotentiallyInterestingMarker />
      )}
    </UnstyledButton>
  );

  if (errorMessage) {
    return (
      <Tooltip
        className={S.errorTooltip}
        label={errorMessage}
        multiline
        maw="20rem"
        position="right"
      >
        {row}
      </Tooltip>
    );
  }

  return row;
}

const STATUS_ARIA_LABELS: Record<
  ExplorationQueryStatus | ExplorationQueryGroupStatus,
  () => string
> = {
  pending: () => t`Generating chart…`,
  running: () => t`Generating chart…`,
  done: () => t`Chart ready`,
  error: () => t`Failed to generate chart`,
};

function ExplorationQueryStatusIcon({
  status,
}: {
  status: ExplorationQueryStatus | ExplorationQueryGroupStatus;
}) {
  const label = STATUS_ARIA_LABELS[status]();

  if (status === "pending" || status === "running") {
    return <Loader size="xs" aria-label={label} />;
  }

  if (status === "error") {
    return <Icon name="warning" c="error" aria-label={label} />;
  }

  return <Icon name="document" c="text-secondary" aria-label={label} />;
}

function getExplorationThreadName(thread: ExplorationThread, index: number) {
  if (thread.name) {
    return thread.name;
  }
  if (index === 0) {
    return t`Initial investigation`;
  }
  return t`New exploration`;
}

/**
 * Walk up the DOM looking for the nearest ancestor that scrolls
 * vertically (`overflow-y` is `auto` or `scroll`). Returns `null` when
 * none is found. Used by the sidebar to identify the per-thread
 * `.threadList` element so we can adjust its `scrollTop` to keep the
 * selected row stable across re-sorts.
 */
function findScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let cur: HTMLElement | null = el?.parentElement ?? null;
  while (cur) {
    const overflowY = getComputedStyle(cur).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}
