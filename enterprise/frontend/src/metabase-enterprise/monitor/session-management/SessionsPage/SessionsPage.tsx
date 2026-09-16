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
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { Sidebar } from "metabase/monitor/components/MonitorLayout/Sidebar";
import { useLocation, useNavigate, useParams } from "metabase/router";
import { Button, Flex, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useLazyListSessionsQuery } from "metabase-enterprise/api";
import type {
  AdminSessionId,
  RevokeAdminSessionsRequest,
} from "metabase-types/api";

import { SIDEBAR_WIDTH, SessionDetailSidebar } from "../SessionDetailSidebar";
import { SessionsFilters } from "../SessionsFilters";
import { SessionsTable } from "../SessionsTable";

import {
  DEFAULT_SORT_COLUMN,
  DEFAULT_SORT_DIRECTION,
  PAGE_SIZE,
  SORT_COLUMN_VALUES,
} from "./constants";
import type { RouteParams } from "./types";
import { useSessionRevocation } from "./use-session-revocation";
import { buildListParams, urlStateConfig } from "./utils";

export const SessionsPage = () => {
  usePageTitle(t`Session management`);

  const location = useLocation();
  const navigate = useNavigate();
  const { sessionId } = useParams<RouteParams>();
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [urlState, { patchUrlState }] = useUrlState(location, urlStateConfig);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const clearSelection = useCallback(() => setRowSelection({}), []);

  const { data, isLoading, isFetching, error } = useAbortableQuery(
    useLazyListSessionsQuery,
    buildListParams(urlState, PAGE_SIZE),
  );
  const sessions = useMemo(() => data?.data ?? [], [data?.data]);
  const total = data?.total ?? 0;
  const selectedSessions = useMemo(
    () => sessions.filter((session) => rowSelection[session.id]),
    [sessions, rowSelection],
  );
  const selectedCount = selectedSessions.length;

  useEffect(() => {
    clearSelection();
  }, [
    clearSelection,
    urlState.page,
    urlState.query,
    urlState.provider,
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
      const column = SORT_COLUMN_VALUES.find((value) => value === first.id);
      if (column === undefined) {
        return;
      }
      patchUrlState({
        sort_column: column,
        sort_direction: first.desc ? "desc" : "asc",
        page: 0,
      });
    },
    [patchUrlState],
  );

  const handleSearchChange = useCallback(
    (query: string) => patchUrlState({ query, page: 0 }),
    [patchUrlState],
  );

  // Keep page, search and sort in the URL while the sidebar opens, closes, and steps between sessions
  const navigateToSession = useCallback(
    (id: AdminSessionId | undefined) => {
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
      sessionId === undefined
        ? -1
        : sessions.findIndex((session) => session.id === sessionId);
    if (index === -1) {
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

  const handleRevoked = useCallback(
    (request: RevokeAdminSessionsRequest) => {
      clearSelection();
      // The caller's own session survives every revoke, and an id list only removes the sessions it names
      const isShownSessionKept =
        sessionFromPage?.current === true ||
        (request.ids !== undefined &&
          sessionId !== undefined &&
          !request.ids.includes(sessionId));
      if (sessionId !== undefined && !isShownSessionKept) {
        navigateToSession(undefined);
      }
    },
    [clearSelection, navigateToSession, sessionFromPage, sessionId],
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
          <Flex justify="space-between" align="center" mb="sm" pr="4rem">
            <MonitorHeaderTitle>{t`Session management`}</MonitorHeaderTitle>
            <Button
              leftSection={<Icon name="exit" />}
              disabled={isRevoking || total === 0}
              onClick={revokeAll}
            >
              {t`Revoke all sessions`}
            </Button>
          </Flex>

          <Flex gap="md" align="center">
            <DebouncedSearchInput
              value={urlState.query}
              placeholder={t`Search by name or email…`}
              aria-label={t`Search sessions`}
              onChange={handleSearchChange}
            />
            <SessionsFilters state={urlState} onChange={patchUrlState} />
          </Flex>

          <SessionsTable
            sessions={sessions}
            error={error}
            isFetching={isFetching}
            isLoading={isLoading}
            page={urlState.page}
            rowSelection={rowSelection}
            selectedSessionId={sessionId}
            sorting={sorting}
            onSortingChange={handleSortingChange}
            onRowSelectionChange={setRowSelection}
            onRowClick={navigateToSession}
          />

          {!isLoading && error === undefined && (
            <Flex justify="end">
              <PaginationControls
                page={urlState.page}
                pageSize={PAGE_SIZE}
                itemsLength={sessions.length}
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
