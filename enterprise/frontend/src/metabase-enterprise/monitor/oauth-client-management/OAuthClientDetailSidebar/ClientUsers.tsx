import { msgid, ngettext, t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/monitor/components/DetailSidebar";
import { Box, Stack, Text } from "metabase/ui";
import type { OAuthClientUser } from "metabase-types/api";

import { getOAuthClientUserName } from "../utils";

import type { ClientUsersProps } from "./types";

const UserValue = ({ user }: { user: OAuthClientUser }) => (
  <Stack gap={0}>
    <Text size="md" c="text-primary">
      {ngettext(
        msgid`${user.live_tokens} live token`,
        `${user.live_tokens} live tokens`,
        user.live_tokens,
      )}
    </Text>
    <Text size="sm" c="text-secondary">
      {user.last_approved_at ? (
        <>
          {t`Last approved`}{" "}
          <DateTime value={user.last_approved_at} unit="minute" />
        </>
      ) : (
        t`No approval on record`
      )}
    </Text>
  </Stack>
);

export const ClientUsers = ({ users }: ClientUsersProps) => (
  <Box data-testid="oauth-client-users">
    <SidebarSection title={t`Users`}>
      {/* `users` absent means the detail has not landed: "nobody" is only ever said of a list that has */}
      <LoadingAndErrorWrapper loading={users === undefined} noWrapper>
        {users?.length === 0 ? (
          <Text c="text-secondary">{t`Nobody is connected through this client right now.`}</Text>
        ) : (
          <DetailsTable>
            {users?.map((user) => (
              <DetailsRow
                key={user.id}
                label={getOAuthClientUserName(user)}
                value={<UserValue user={user} />}
              />
            ))}
          </DetailsTable>
        )}
      </LoadingAndErrorWrapper>
    </SidebarSection>
  </Box>
);
