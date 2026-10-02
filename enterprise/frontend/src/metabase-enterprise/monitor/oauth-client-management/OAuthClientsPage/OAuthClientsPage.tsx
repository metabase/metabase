import type { RowSelectionState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import {
  BulkActionBar,
  BulkActionButton,
} from "metabase/common/components/BulkActionBar";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useAbortableQuery } from "metabase/common/hooks/use-abortable-query";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { useLocation } from "metabase/router";
import { Flex, Text } from "metabase/ui";
import { useLazyListOAuthClientsQuery } from "metabase-enterprise/api";

import { OAuthClientsTable } from "../OAuthClientsTable";
import { OAuthClientsTabs } from "../OAuthClientsTabs";

import { PAGE_SIZE } from "./constants";
import { useClientRevocation } from "./use-client-revocation";
import { buildListParams, urlStateConfig } from "./utils";

export const OAuthClientsPage = () => {
  usePageTitle(t`OAuth clients`);

  const location = useLocation();
  const [urlState, { patchUrlState }] = useUrlState(location, urlStateConfig);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const clearSelection = useCallback(() => setRowSelection({}), []);

  const { data, isLoading, isFetching, error } = useAbortableQuery(
    useLazyListOAuthClientsQuery,
    buildListParams(urlState, PAGE_SIZE),
  );
  const clients = useMemo(() => data?.data ?? [], [data?.data]);
  const total = data?.total ?? 0;
  const isRevokedTab = urlState.tab === "revoked";
  const selectedClients = useMemo(
    () => clients.filter((client) => rowSelection[client.client_id]),
    [clients, rowSelection],
  );
  const selectedCount = selectedClients.length;

  useEffect(() => {
    clearSelection();
  }, [clearSelection, urlState.page, urlState.tab]);

  const { isRevoking, confirmModal, revokeSelected } = useClientRevocation({
    onRevoked: clearSelection,
  });

  return (
    <>
      <MonitorMain>
        <MonitorHeaderTitle mb="sm">{t`OAuth clients`}</MonitorHeaderTitle>

        <OAuthClientsTabs
          tab={urlState.tab}
          onChange={(patch) => patchUrlState({ ...patch, page: 0 })}
        />

        {isRevokedTab && (
          <Text size="sm" c="text-secondary">
            {t`Revoked clients are kept on record.`}
          </Text>
        )}

        <OAuthClientsTable
          clients={clients}
          error={error}
          isFetching={isFetching}
          isLoading={isLoading}
          isRevokedTab={isRevokedTab}
          page={urlState.page}
          rowSelection={rowSelection}
          emptyLabel={
            isRevokedTab
              ? t`Clients you revoke will appear here.`
              : t`No active clients`
          }
          onRowSelectionChange={setRowSelection}
        />

        {!isLoading && error === undefined && (
          <Flex justify="end">
            <PaginationControls
              page={urlState.page}
              pageSize={PAGE_SIZE}
              itemsLength={clients.length}
              total={total}
              showTotal
              onPreviousPage={() =>
                patchUrlState({ page: urlState.page - 1 }, { immediate: true })
              }
              onNextPage={() =>
                patchUrlState({ page: urlState.page + 1 }, { immediate: true })
              }
            />
          </Flex>
        )}
      </MonitorMain>

      <BulkActionBar
        opened={selectedCount > 0}
        message={ngettext(
          msgid`${selectedCount} client selected`,
          `${selectedCount} clients selected`,
          selectedCount,
        )}
      >
        <BulkActionButton
          danger
          disabled={isRevoking}
          onClick={() => revokeSelected(selectedClients)}
        >
          {t`Revoke`}
        </BulkActionButton>
        <BulkActionButton onClick={clearSelection}>{t`Clear`}</BulkActionButton>
      </BulkActionBar>

      {confirmModal}
    </>
  );
};
