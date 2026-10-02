import { t } from "ttag";

import { useListOAuthAuthorizationsQuery } from "metabase/admin/settings/api/oauth";
import { DateTime } from "metabase/common/components/DateTime";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getOAuthEventTypeLabel } from "metabase/common/utils/oauth";
import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/monitor/components/DetailSidebar";
import { Box, Stack, Text } from "metabase/ui";
import type { OAuthAuthorization } from "metabase-types/api";

import { ACTIVITY_PAGE_SIZE } from "./constants";
import type { ClientActivityProps } from "./types";

const EventValue = ({ event }: { event: OAuthAuthorization }) => (
  <Stack gap={0}>
    <Text size="md" c="text-primary">
      <DateTime value={event.created_at} unit="minute" />
    </Text>
    {event.user_email && (
      <Text size="sm" c="text-secondary">
        {event.user_email}
      </Text>
    )}
  </Stack>
);

export const ClientActivity = ({ clientId }: ClientActivityProps) => {
  // The OSS Authorization logs endpoint, so the sidebar reads the same timeline that page does rather than one of
  // its own — it already filters by client and joins the acting user.
  const { currentData, isLoading, error } = useListOAuthAuthorizationsQuery({
    "client-id": clientId,
    limit: ACTIVITY_PAGE_SIZE,
    offset: 0,
  });
  const events = currentData?.data ?? [];
  const isTruncated = (currentData?.total ?? 0) > events.length;

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
                  {t`Showing the ${ACTIVITY_PAGE_SIZE} most recent events. The Authorization logs page has the rest.`}
                </Text>
              )}
            </Stack>
          )}
        </LoadingAndErrorWrapper>
      </SidebarSection>
    </Box>
  );
};
