import { t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/monitor/components/DetailSidebar";
import { MonitorDateValue } from "metabase/monitor/components/MonitorDateValue";
import { Box, Skeleton, Stack, Text } from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";

import { getRegistrationTypeLabel, getRevokerName } from "../utils";

import S from "./OAuthClientDetailSidebar.module.css";
import type { ClientDetailsProps } from "./types";

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

const DetailListValue = ({
  values,
}: {
  values: readonly string[] | undefined;
}) =>
  values === undefined ? (
    <Skeleton h={16} w="60%" my={4} />
  ) : (
    <ListValue values={values} />
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
          <DetailsRow
            label={t`Contacts`}
            value={<DetailListValue values={detail?.contacts} />}
          />
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
          <DetailsRow
            label={t`Scopes`}
            value={<DetailListValue values={detail?.scopes} />}
          />
          <DetailsRow
            label={t`Last used`}
            value={
              client.last_used_at ? (
                <MonitorDateValue value={client.last_used_at} />
              ) : (
                t`Never used`
              )
            }
          />
          <DetailsRow
            label={t`Registered`}
            value={<MonitorDateValue value={client.created_at} />}
          />
          {isRevoked && (
            <DetailsRow
              label={t`Revoked`}
              value={
                client.revoked_at ? (
                  <MonitorDateValue value={client.revoked_at} />
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
