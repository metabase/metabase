import dayjs from "dayjs";
import { t } from "ttag";
import { partition } from "underscore";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Alert, Button, Group, Icon, Text, Title } from "metabase/ui";
import { useListSupportAccessGrantsQuery } from "metabase-enterprise/api/support-access-grants";
import type { SupportAccessGrant } from "metabase-types/api";

import { AccessGrantList } from "./components/AccessGrantList";

export function SupportSettingsPage() {
  const {
    data: listResponse,
    isLoading,
    error,
  } = useListSupportAccessGrantsQuery({
    "include-revoked": true,
  });
  const { data: accessGrants = [] } = listResponse || {};
  const [activeAccessGrants, pastAccessGrants] = partition(
    accessGrants,
    isGrantActive,
  );

  return (
    <SettingsPageWrapper title={t`Support`}>
      <SettingsSection>
        <LoadingAndErrorWrapper error={error} loading={isLoading}>
          <Group justify="space-between" mb="md">
            <Title order={3} lh="2.5rem">{t`Active Access Grants`}</Title>
            <Button variant="filled">{t`Grant Access`}</Button>
          </Group>
          {activeAccessGrants.length > 0 ? (
            <AccessGrantList accessGrants={activeAccessGrants} active />
          ) : (
            <Alert icon={<Icon name="info" />}>
              <Text>{t`No active access grants.`}</Text>
            </Alert>
          )}

          {pastAccessGrants.length > 0 && (
            <>
              <Title
                lh="2.5rem"
                mb="md"
                mt="lg"
                order={3}
                pt="lg"
              >{t`Past Access Grants`}</Title>
              <AccessGrantList accessGrants={pastAccessGrants} />
            </>
          )}
        </LoadingAndErrorWrapper>
      </SettingsSection>
    </SettingsPageWrapper>
  );
}

const isGrantActive = (grant: SupportAccessGrant) => {
  return (
    !grant.revoked_at &&
    !!grant.grant_end_timestamp &&
    dayjs(grant.grant_end_timestamp).isAfter(dayjs())
  );
};
