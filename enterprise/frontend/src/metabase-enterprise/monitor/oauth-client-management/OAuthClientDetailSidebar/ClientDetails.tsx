import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/monitor/components/DetailSidebar";
import { Box, Stack, Text } from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";

import { getRegistrationTypeLabel, getRevokerName } from "../utils";

import S from "./OAuthClientDetailSidebar.module.css";
import type { ClientDetailsProps } from "./types";

const DateValue = ({ value }: { value: string }) => (
  <Text size="md" c="text-primary">
    <DateTime value={value} unit="minute" />
  </Text>
);

/** One value per line, so a client with several redirect URIs or scopes stays readable. */
const ListValue = ({ values }: { values: readonly string[] }) =>
  values.length === 0 ? (
    <Text size="md" c="text-primary">
      {EMPTY_CELL_PLACEHOLDER}
    </Text>
  ) : (
    <Stack gap={0}>
      {values.map((value) => (
        <Text key={value} size="md" c="text-primary" className={S.wrapAnywhere}>
          {value}
        </Text>
      ))}
    </Stack>
  );

export const ClientDetails = ({ client, detail }: ClientDetailsProps) => {
  const isRevoked = client.status === "revoked";

  return (
    <Box data-testid="oauth-client-details">
      <SidebarSection title={t`Details`}>
        <DetailsTable>
          <DetailsRow label={t`Client ID`} value={client.client_id} />
          <DetailsRow
            label={t`Client URI`}
            value={client.client_uri ?? EMPTY_CELL_PLACEHOLDER}
          />
          {/* `contacts` and `scopes` are the detail's own fields, so they arrive after the row the list handed over */}
          {detail && (
            <DetailsRow
              label={t`Contacts`}
              value={<ListValue values={detail.contacts} />}
            />
          )}
          <DetailsRow
            label={t`Application type`}
            value={client.application_type ?? EMPTY_CELL_PLACEHOLDER}
          />
          <DetailsRow
            label={t`Registration type`}
            value={getRegistrationTypeLabel(client.registration_type)}
          />
          <DetailsRow
            label={t`Redirect URIs`}
            value={<ListValue values={client.redirect_uris} />}
          />
          {detail && (
            <DetailsRow
              label={t`Scopes`}
              value={<ListValue values={detail.scopes} />}
            />
          )}
          <DetailsRow
            label={t`Last used`}
            value={
              client.last_used_at ? (
                <DateValue value={client.last_used_at} />
              ) : (
                t`Never used`
              )
            }
          />
          <DetailsRow
            label={t`Registered`}
            value={<DateValue value={client.created_at} />}
          />
          {isRevoked && (
            <DetailsRow
              label={t`Revoked`}
              value={
                client.revoked_at ? (
                  <DateValue value={client.revoked_at} />
                ) : (
                  EMPTY_CELL_PLACEHOLDER
                )
              }
            />
          )}
          {isRevoked && (
            <DetailsRow
              label={t`Revoked by`}
              value={getRevokerName(client) ?? EMPTY_CELL_PLACEHOLDER}
            />
          )}
        </DetailsTable>
      </SidebarSection>
    </Box>
  );
};
