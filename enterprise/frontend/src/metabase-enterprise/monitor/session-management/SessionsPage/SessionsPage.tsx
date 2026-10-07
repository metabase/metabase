import { useElementSize } from "@mantine/hooks";
import type { RowSelectionState, SortingState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import {
  BulkActionBar,
  BulkActionButton,
} from "metabase/common/components/BulkActionBar";
import { DebouncedSearchInput } from "metabase/common/components/DebouncedSearchInput";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useAbortableQuery } from "metabase/common/hooks/use-abortable-query";
import { usePageInRange } from "metabase/common/hooks/use-page-in-range";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { SIDEBAR_WIDTH } from "metabase/monitor/components/DetailSidebar";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { Sidebar } from "metabase/monitor/components/MonitorLayout/Sidebar";
import { useLocation, useNavigate, useParams } from "metabase/router";
import { Button, Flex, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useLazyListSessionsQuery } from "metabase-enterprise/api";
import type { RevokeSessionsRequest, SessionId } from "metabase-types/api";

import { SessionDetailSidebar, useShownSession } from "../SessionDetailSidebar";
import { SessionsFilters } from "../SessionsFilters";
import { SessionsTable } from "../SessionsTable";
import { SessionsTabs } from "../SessionsTabs";

import {
  DEFAULT_SORT_COLUMN,
  DEFAULT_SORT_DIRECTION,
  PAGE_SIZE,
  TAB_SORT_COLUMNS,
} from "./constants";
import type { RouteParams } from "./types";
import { useSessionRevocation } from "./use-session-revocation";
import {
  buildListParams,
  getTabChange,
  getTimePresetCutoff,
  isSessionRevokedBy,
  urlStateConfig,
} from "./utils";

export const SessionsPage = () => {
  usePageTitle(t`Session management`);

  const location = useLocation();
  const navigate = useNavigate();
  const { sessionId } = useParams<RouteParams>();
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [urlState, { patchUrlState }] = useUrlState(location, urlStateConfig);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const clearSelection = useCallback(() => setRowSelection({}), []);

  const lastActiveAfter = useMemo(
    () => getTimePresetCutoff(urlState.last_active),
    [urlState.last_active],
  );
  const endedAfter = useMemo(
    () => getTimePresetCutoff(urlState.ended),
    [urlState.ended],
  );

  const { data, isLoading, isFetching, error } = useAbortableQuery(
    useLazyListSessionsQuery,
    buildListParams(urlState, PAGE_SIZE, lastActiveAfter, endedAfter),
  );
  const sessions = data?.data;
  const total = data?.total ?? 0;
  const isEndedTab = urlState.tab === "ended";
  const selectedSessions = useMemo(
    () => sessions?.filter((session) => rowSelection[session.id]) ?? [],
    [sessions, rowSelection],
  );
  const selectedCount = selectedSessions.length;

  const goToPage = useCallback(
    (page: number) => patchUrlState({ page }, { immediate: true }),
    [patchUrlState],
  );

  // A revoke can empty a later page
  usePageInRange({
    page: urlState.page,
    pageSize: PAGE_SIZE,
    total: isFetching || error !== undefined ? undefined : data?.total,
    onPageChange: goToPage,
  });

  useEffect(() => {
    clearSelection();
  }, [
    clearSelection,
    urlState.page,
    urlState.query,
    urlState.tab,
    urlState.provider,
    urlState.last_active,
    urlState.ended,
    urlState.reason,
    urlState.sort_column,
    urlState.sort_direction,
  ]);

  const sorting: SortingState = [
    {
      id: urlState.sort_column,
      desc: urlState.sort_direction === "desc",
    },
  ];

  const handleSortingChange = useCallback(
    (next: SortingState) => {
      if (next.length === 0) {
        patchUrlState({
          sort_column: DEFAULT_SORT_COLUMN,
          sort_direction: DEFAULT_SORT_DIRECTION,
          page: 0,
        });
        return;
      }
      const [first] = next;
      const column = TAB_SORT_COLUMNS[urlState.tab].find(
        (value) => value === first.id,
      );
      if (column === undefined) {
        return;
      }
      patchUrlState({
        sort_column: column,
        sort_direction: first.desc ? "desc" : "asc",
        page: 0,
      });
    },
    [patchUrlState, urlState.tab],
  );

  const handleSearchChange = useCallback(
    (query: string) => patchUrlState({ query, page: 0 }),
    [patchUrlState],
  );

  // Keep page, search and sort in the URL while the sidebar opens, closes, and steps between sessions
  const navigateToSession = useCallback(
    (id: SessionId | undefined) => {
      navigate({
        pathname:
          id === undefined
            ? Urls.monitorSessions()
            : Urls.monitorSessionDetail(id),
        search: location.search,
      });
    },
    [navigate, location.search],
  );

  const handleSidebarClose = useCallback(
    () => navigateToSession(undefined),
    [navigateToSession],
  );

  const { prevSessionId, nextSessionId, sessionFromPage } = useMemo(() => {
    const index =
      sessionId === undefined || sessions === undefined
        ? -1
        : sessions.findIndex((session) => session.id === sessionId);
    if (sessions === undefined || index === -1) {
      return {
        prevSessionId: undefined,
        nextSessionId: undefined,
        sessionFromPage: undefined,
      };
    }
    return {
      prevSessionId: index > 0 ? sessions[index - 1].id : undefined,
      nextSessionId:
        index < sessions.length - 1 ? sessions[index + 1].id : undefined,
      sessionFromPage: sessions[index],
    };
  }, [sessionId, sessions]);

  const { session: shownSession } = useShownSession(sessionId, sessionFromPage);

  const handleRevoked = useCallback(
    (request: RevokeSessionsRequest) => {
      clearSelection();
      const isShownSessionGone =
        shownSession === undefined || isSessionRevokedBy(shownSession, request);
      if (sessionId !== undefined && isShownSessionGone) {
        navigateToSession(undefined);
      }
    },
    [clearSelection, navigateToSession, shownSession, sessionId],
  );

  const {
    isRevoking,
    confirmModal,
    revokeSelected,
    revokeSession,
    revokeUserSessions,
    revokeAll,
  } = useSessionRevocation({ onRevoked: handleRevoked });

  return (
    <>
      <Flex ref={containerRef} h="100%" wrap="nowrap">
        <MonitorMain>
          <MonitorHeaderTitle mb="sm">{t`Session management`}</MonitorHeaderTitle>

          <SessionsTabs
            tab={urlState.tab}
            onChange={(tab) => patchUrlState(getTabChange(urlState, tab))}
          />

          {isEndedTab && (
            <Text size="sm" c="text-secondary">
              {t`Ended sessions are kept for 30 days.`}
            </Text>
          )}

          <Flex gap="md" align="center">
            <DebouncedSearchInput
              value={urlState.query}
              placeholder={t`Search by name or email…`}
              aria-label={t`Search sessions`}
              onChange={handleSearchChange}
            />
            <SessionsFilters state={urlState} onChange={patchUrlState} />
            {!isEndedTab && (
              // not tied to the listed total: revoking all ignores the search and filters
              <Button disabled={isRevoking} onClick={revokeAll}>
                {t`Revoke all active sessions`}
              </Button>
            )}
          </Flex>

          <SessionsTable
            sessions={sessions}
            error={error}
            isFetching={isFetching}
            isEndedTab={isEndedTab}
            page={urlState.page}
            rowSelection={rowSelection}
            selectedSessionId={sessionId}
            sorting={sorting}
            emptyLabel={
              isEndedTab
                ? t`Sessions that have ended will start appearing here as they are timed out, revoked or as users log out`
                : t`No active sessions`
            }
            onSortingChange={handleSortingChange}
            onRowSelectionChange={setRowSelection}
            onRowClick={navigateToSession}
          />

          {!isLoading && error === undefined && (
            <Flex justify="end">
              <PaginationControls
                page={urlState.page}
                pageSize={PAGE_SIZE}
                itemsLength={sessions?.length ?? 0}
                total={total}
                showTotal
                onPreviousPage={() =>
                  patchUrlState(
                    { page: urlState.page - 1 },
                    { immediate: true },
                  )
                }
                onNextPage={() =>
                  patchUrlState(
                    { page: urlState.page + 1 },
                    { immediate: true },
                  )
                }
              />
            </Flex>
          )}
        </MonitorMain>

        {sessionId !== undefined && (
          <Sidebar containerWidth={containerWidth} defaultWidth={SIDEBAR_WIDTH}>
            <SessionDetailSidebar
              sessionId={sessionId}
              sessionFromPage={sessionFromPage}
              prevSessionId={prevSessionId}
              nextSessionId={nextSessionId}
              isRevoking={isRevoking}
              onNavigate={navigateToSession}
              onRevokeSession={revokeSession}
              onRevokeUserSessions={revokeUserSessions}
              onClose={handleSidebarClose}
            />
          </Sidebar>
        )}
      </Flex>

      <BulkActionBar
        opened={selectedCount > 0}
        message={ngettext(
          msgid`${selectedCount} session selected`,
          `${selectedCount} sessions selected`,
          selectedCount,
        )}
      >
        <BulkActionButton
          danger
          disabled={isRevoking}
          onClick={() => revokeSelected(selectedSessions)}
        >
          {t`Revoke`}
        </BulkActionButton>
        <BulkActionButton onClick={clearSelection}>{t`Clear`}</BulkActionButton>
      </BulkActionBar>

      {confirmModal}
    </>
  );
};
