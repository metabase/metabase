import { c, t } from "ttag";

import { useListOAuthAuthorizationsQuery } from "metabase/admin/settings/api/oauth";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getOAuthEventTypeLabel } from "metabase/common/utils/oauth";
import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/monitor/components/DetailSidebar";
import { MonitorDateValue } from "metabase/monitor/components/MonitorDateValue";
import { Box, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { OAuthAuthorization } from "metabase-types/api";

import { ACTIVITY_PAGE_SIZE } from "./constants";
import type { ClientActivityProps } from "./types";

const EventValue = ({ event }: { event: OAuthAuthorization }) => (
  <Stack gap={0}>
    <MonitorDateValue value={event.created_at} />
    {event.user_email && (
      <Text size="sm" c="text-secondary">
        {event.user_email}
      </Text>
    )}
  </Stack>
);

export const ClientActivity = ({ clientId }: ClientActivityProps) => {
  const { currentData, error } = useListOAuthAuthorizationsQuery({
    "client-id": clientId,
    limit: ACTIVITY_PAGE_SIZE,
    offset: 0,
  });
  const events = currentData?.data ?? [];
  const isTruncated = (currentData?.total ?? 0) > events.length;
  // not `isLoading`, which stays false once any client's events have loaded
  const isLoading = currentData === undefined && error === undefined;

  return (
    <Box data-testid="oauth-client-activity">
      <SidebarSection title={t`Activity`}>
        <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
          {events.length === 0 ? (
            <Text c="text-secondary">{t`No activity on record for this client.`}</Text>
          ) : (
            <Stack gap="sm">
              <DetailsTable>
                {events.map((event) => (
                  <DetailsRow
                    key={event.id}
                    label={getOAuthEventTypeLabel(event.event_type)}
                    value={<EventValue event={event} />}
                  />
                ))}
              </DetailsTable>
              {isTruncated && (
                <Text size="sm" c="text-secondary">
                  {c("{1} is a link to the Authorization logs page")
                    .jt`Showing the ${ACTIVITY_PAGE_SIZE} most recent events. The ${(
                    <Link
                      key="authorization-logs"
                      variant="brand"
                      to={Urls.adminMcpAuthorizations()}
                    >
                      {t`Authorization logs page`}
                    </Link>
                  )} has the rest.`}
                </Text>
              )}
            </Stack>
          )}
        </LoadingAndErrorWrapper>
      </SidebarSection>
    </Box>
  );
};
