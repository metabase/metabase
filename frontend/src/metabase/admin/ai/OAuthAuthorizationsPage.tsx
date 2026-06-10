import { useMemo } from "react";
import type { WithRouterProps } from "react-router";
import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { useListOAuthAuthorizationsQuery } from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import { EmptyState } from "metabase/common/components/EmptyState";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
  useUrlState,
} from "metabase/common/hooks/use-url-state";
import CS from "metabase/css/core/index.css";
import {
  Badge,
  Box,
  Card,
  Ellipsified,
  Group,
  Select,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import type { MetabaseColorKey } from "metabase/ui/colors/types";
import type {
  OAuthAuthorization,
  OAuthClientEventType,
} from "metabase-types/api";

import S from "./OAuthAuthorizationsPage.module.css";
import {
  OAUTH_EVENT_TYPES,
  OAUTH_PAGE_SIZE,
  getOAuthEventTypeLabel,
  isOAuthEventType,
} from "./oauth-utils";

const ALL_EVENT_TYPES = "all";

type EventTypeFilter = OAuthClientEventType | typeof ALL_EVENT_TYPES;

const EVENT_COLORS: Record<OAuthClientEventType, MetabaseColorKey> = {
  registered: "text-secondary",
  approved: "success",
  denied: "error",
};

type UrlState = {
  page: number;
  eventType: EventTypeFilter;
};

const urlStateConfig: UrlStateConfig<UrlState> = {
  parse: (query) => ({
    page: parsePage(query.page),
    eventType: parseEventType(query.event_type),
  }),
  serialize: ({ page, eventType }) => ({
    page: page === 0 ? undefined : String(page),
    event_type: eventType === ALL_EVENT_TYPES ? undefined : eventType,
  }),
};

function parsePage(param: QueryParam): number {
  const parsed = parseInt(getFirstParamValue(param) || "0", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseEventType(param: QueryParam): EventTypeFilter {
  const value = getFirstParamValue(param);
  return value && isOAuthEventType(value) ? value : ALL_EVENT_TYPES;
}

export const OAuthAuthorizationsPage = ({ location }: WithRouterProps) => {
  const [{ page, eventType }, { patchUrlState }] = useUrlState(
    location,
    urlStateConfig,
  );

  const { data, isLoading, error } = useListOAuthAuthorizationsQuery(
    {
      limit: OAUTH_PAGE_SIZE,
      offset: page * OAUTH_PAGE_SIZE,
      "event-type": eventType === ALL_EVENT_TYPES ? undefined : eventType,
    },
    { refetchOnMountOrArgChange: true },
  );

  const authorizations = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <SettingsPageWrapper
      title={t`Authorization logs`}
      description={t`An audit log of MCP and Agent API client registrations and the authorization decisions users have approved or denied.`}
      h="100%"
      mih={0}
      w="100%"
      maw="60rem"
      mx="auto"
      p="xl"
    >
      <Select
        data={[
          { value: ALL_EVENT_TYPES, label: t`All events` },
          ...OAUTH_EVENT_TYPES.map((value) => ({
            value,
            label: getOAuthEventTypeLabel(value),
          })),
        ]}
        value={eventType}
        onChange={(value) =>
          patchUrlState({
            eventType: value ?? ALL_EVENT_TYPES,
            page: 0,
          })
        }
        aria-label={t`Filter by event`}
        style={{ alignSelf: "start" }}
      />

      <AuthorizationsTable
        authorizations={authorizations}
        isLoading={isLoading}
        error={error}
      />
      <Group justify="end">
        <PaginationControls
          page={page}
          pageSize={OAUTH_PAGE_SIZE}
          itemsLength={authorizations.length}
          total={total}
          onPreviousPage={() => patchUrlState({ page: page - 1 })}
          onNextPage={() => patchUrlState({ page: page + 1 })}
        />
      </Group>
    </SettingsPageWrapper>
  );
};

function getAuthorizationColumns(): TreeTableColumnDef<OAuthAuthorization>[] {
  // The text columns stretch to fill the container (no `width`) so the table never grows
  // wider than its parent. `client`/`user` cap at 220; `redirect-uri` stays uncapped to
  // absorb leftover width. `event`/`created-at` are fixed.
  return [
    {
      id: "client",
      header: t`Client`,
      minWidth: 120,
      maxWidth: 180,
      accessorFn: (auth) => auth.client_name || auth.client_id || "—",
      cell: ({ getValue }) => (
        <Ellipsified className={CS.textBold}>{String(getValue())}</Ellipsified>
      ),
    },
    {
      id: "user",
      header: t`User`,
      minWidth: 120,
      maxWidth: 180,
      accessorFn: (auth) => auth.user_email ?? "—",
      cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
    },
    {
      id: "redirect-uri",
      header: t`Redirect URI`,
      minWidth: 120,
      accessorFn: (auth) =>
        auth.redirect_uris?.length ? auth.redirect_uris.join(", ") : "—",
      cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
    },
    {
      id: "event",
      header: t`Event`,
      width: 120,
      cell: ({ row }) => {
        const { event_type } = row.original;
        return (
          <Badge color={EVENT_COLORS[event_type]} variant="light">
            {getOAuthEventTypeLabel(event_type)}
          </Badge>
        );
      },
    },
    {
      id: "created-at",
      header: t`Date`,
      width: 160,
      accessorFn: (auth) => auth.created_at,
      cell: ({ row }) => (
        <DateTime value={row.original.created_at} unit="minute" />
      ),
    },
  ];
}

function AuthorizationsTable({
  authorizations,
  isLoading,
  error,
}: {
  authorizations: OAuthAuthorization[];
  isLoading: boolean;
  error: unknown;
}) {
  const columns = useMemo(() => getAuthorizationColumns(), []);
  const instance = useTreeTableInstance<OAuthAuthorization>({
    data: authorizations,
    columns,
    getNodeId: (auth) => String(auth.id),
    enableSorting: false,
  });

  if (isLoading || error) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <Card
      withBorder
      p={0}
      flex="1"
      mih={0}
      display="flex"
      style={{ flexDirection: "column", overflow: "hidden" }}
      data-testid="oauth-authorizations-table"
    >
      <TreeTable
        instance={instance}
        hierarchical={false}
        classNames={{ row: S.staticRow }}
        ariaLabel={t`OAuth authorizations`}
        emptyState={
          <Box p="xl" ta="center" data-testid="oauth-authorizations-empty">
            <EmptyState
              title={t`No events`}
              illustrationElement={<img src={NoResults} />}
              spacing="sm"
            />
          </Box>
        }
      />
    </Card>
  );
}
