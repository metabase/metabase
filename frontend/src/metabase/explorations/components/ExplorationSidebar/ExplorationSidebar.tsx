import cx from "classnames";
import {
  type Ref,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import {
  Box,
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
import { getAdjacentById, shouldIgnoreKeyboardEvent } from "../../utils";

import S from "./ExplorationSidebar.module.css";

interface ExplorationSidebarProps {
  exploration: Exploration;
  selectedEntityId: SelectedEntityId | null;
  setSelectedEntityId: (entityId: SelectedEntityId) => void;
  threadsWithSortedQueries: ThreadsWithSortedQueries[];
}

type ExplorationSidebarItem =
  | (ExplorationQueryWithName & { type: "query" })
  | (ExplorationDocument & { type: "document" });

const INTERESTINGNESS_SCORE_THRESHOLD = 0.7;

export function ExplorationSidebar({
  exploration,
  selectedEntityId,
  setSelectedEntityId,
  threadsWithSortedQueries,
}: ExplorationSidebarProps) {
  const selectedQueryRef = useRef<HTMLButtonElement | null>(null);

  const selectedQueryId =
    selectedEntityId?.type === "query" ? selectedEntityId.id : null;

  const setSelectedQueryId = useCallback(
    (queryId: ExplorationQueryId) => {
      return setSelectedEntityId({ id: queryId, type: "query" });
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

  useEffect(() => {
    if (selectedEntityId?.type !== "query") {
      return;
    }
    selectedQueryRef.current?.scrollIntoView({
      block: "nearest",
    });
  }, [selectedEntityId]);

  // Visual-order list of queries (group order × group's query_ids ×
  // ungrouped tail) per thread, flattened across threads. This is the
  // sequence keyboard arrow keys walk through.
  const orderedNavQueries = useMemo<ExplorationQueryWithName[]>(() => {
    return threadsWithSortedQueries.flatMap((thread) => {
      const queriesById = new Map(thread.queries.map((q) => [q.id, q]));
      const sortedGroups = (thread.groups ?? [])
        .slice()
        .sort((a, b) => a.position - b.position);
      const groupedIds = new Set<ExplorationQueryId>();
      const groupedFlat = sortedGroups.flatMap((group) =>
        group.query_ids
          .map((id) => {
            groupedIds.add(id);
            return queriesById.get(id);
          })
          .filter((q): q is ExplorationQueryWithName => q != null),
      );
      return [
        ...groupedFlat,
        ...thread.queries.filter((q) => !groupedIds.has(q.id)),
      ];
    });
  }, [threadsWithSortedQueries]);

  // Look up which group (if any) a query belongs to. Used to detect a
  // group-boundary crossing during arrow-key navigation.
  const queryIdToGroupId = useMemo(() => {
    const map = new Map<ExplorationQueryId, ExplorationQueryGroupId>();
    for (const thread of threadsWithSortedQueries) {
      for (const group of thread.groups ?? []) {
        // Single-query groups are rendered flat in the sidebar — they don't
        // have a header to collapse — so don't track them as collapsible.
        if (group.query_ids.length <= 1) {
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

  // Arrow-key navigation. Walks queries in sidebar order; when crossing a
  // group boundary, collapses the source group and opens the destination.
  // Bound to Left/Right because TimelineDropdown owns Up/Down (see
  // ExplorationPage.tsx for the original comment about that constraint).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (selectedQueryId == null) {
        return;
      }
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
        return;
      }
      if (shouldIgnoreKeyboardEvent(event)) {
        return;
      }
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextQuery = getAdjacentById(
        orderedNavQueries,
        selectedQueryId,
        direction,
      );
      if (nextQuery == null || nextQuery.id === selectedQueryId) {
        return;
      }
      event.preventDefault();

      const currentGroupId = queryIdToGroupId.get(selectedQueryId);
      const nextGroupId = queryIdToGroupId.get(nextQuery.id);
      if (currentGroupId && nextGroupId && currentGroupId !== nextGroupId) {
        setOpenGroupIds((prev) => {
          const next = new Set(prev);
          next.delete(currentGroupId);
          next.add(nextGroupId);
          return next;
        });
      } else if (nextGroupId) {
        setOpenGroupIds((prev) =>
          prev.has(nextGroupId) ? prev : new Set(prev).add(nextGroupId),
        );
      }
      setSelectedQueryId(nextQuery.id);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    orderedNavQueries,
    queryIdToGroupId,
    selectedQueryId,
    setSelectedQueryId,
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

  const threadsWithSortedItems = useMemo(() => {
    return threadsWithSortedQueries.map((thread) => {
      const items: ExplorationSidebarItem[] = [
        ...thread.queries.map((query) => ({
          ...query,
          type: "query" as const,
        })),
        ...(thread.documents?.map((document) => ({
          ...document,
          type: "document" as const,
        })) ?? []),
      ];

      return {
        ...thread,
        items,
      };
    });
  }, [threadsWithSortedQueries]);

  return (
    <Stack h="100%" w="20%" flex="none" gap="lg" pt="3rem">
      <Text size="xl" fw="bold">
        {exploration.name}
      </Text>
      {threadsWithSortedItems.map((thread, i) => {
        const documentItem = thread.items.find(
          ({ type }) => type === "document",
        );
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
            <ExplorationThreadQueries
              thread={thread}
              selectedQueryId={selectedQueryId}
              setSelectedQueryId={setSelectedQueryId}
              selectedQueryRef={selectedQueryRef}
              openGroupIds={openGroupIds}
              onToggleGroup={handleToggleGroup}
            />
            {documentItem && thread.queries.length > 0 && (
              <ExplorationDocumentRow
                key={`document-${documentItem.id}`}
                document={documentItem}
                isSelected={
                  selectedEntityId?.type === "document" &&
                  selectedEntityId.id === documentItem.id
                }
                onSelect={() =>
                  setSelectedEntityId({ type: "document", id: documentItem.id })
                }
              />
            )}
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
  selectedQueryRef: Ref<HTMLButtonElement>;
  openGroupIds: ReadonlySet<ExplorationQueryGroupId>;
  onToggleGroup: (group: ExplorationQueryGroup) => void;
}

function ExplorationThreadQueries({
  thread,
  selectedQueryId,
  setSelectedQueryId,
  selectedQueryRef,
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

        // Single-query groups skip the wrapper entirely — the lone query is
        // rendered as a normal row.
        if (groupQueries.length === 1) {
          const query = groupQueries[0];
          const isSelected = selectedQueryId === query.id;

          return (
            <ExplorationQueryRow
              key={query.id}
              query={query}
              isSelected={isSelected}
              buttonRef={isSelected ? selectedQueryRef : undefined}
              onSelect={() => setSelectedQueryId(query.id)}
            />
          );
        }

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
            selectedQueryRef={selectedQueryRef}
          />
        );
      })}
      {ungroupedQueries.map((query) => (
        <ExplorationQueryRow
          key={query.id}
          query={query}
          isSelected={selectedQueryId === query.id}
          buttonRef={
            selectedQueryId === query.id ? selectedQueryRef : undefined
          }
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
  selectedQueryRef: Ref<HTMLButtonElement>;
}

function ExplorationQueryGroupBlock({
  group,
  queries,
  isOpen,
  onToggle,
  selectedQueryId,
  setSelectedQueryId,
  selectedQueryRef,
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
                selectedQueryId === query.id ? selectedQueryRef : undefined
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
  onSelect: () => void;
}

function ExplorationDocumentRow({
  document,
  isSelected,
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
      <Icon name="document" c="text-secondary" aria-label={t`Document`} />
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
        <Tooltip label={t`Potentially interesting`}>
          <Box
            aria-hidden
            w={6}
            h={6}
            bg="interesting"
            className={S.interestingnessIndicator}
          />
        </Tooltip>
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
        <Tooltip label={t`Potentially interesting`}>
          <Box
            aria-hidden
            w={6}
            h={6}
            bg="interesting"
            className={S.interestingnessIndicator}
          />
        </Tooltip>
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
