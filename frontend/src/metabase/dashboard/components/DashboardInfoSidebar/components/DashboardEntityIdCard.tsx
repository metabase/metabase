import { useState } from "react";
import { t } from "ttag";

import {
  SidesheetCard,
  SidesheetCardTitle,
} from "metabase/common/components/Sidesheet";
import { CopyButton } from "metabase/components/CopyButton";
import { EntityIdDisplay } from "metabase/components/EntityIdCard";
import S from "metabase/components/EntityIdCard/EntityIdCard.module.css";
import { Divider, Flex, Select, Stack } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

export const DashboardEntityIdCard = ({
  dashboard,
}: {
  dashboard: Dashboard;
}) => {
  const { tabs } = dashboard;
  // The id of the tab currently selected in the dropdown
  const [tabId, setTabId] = useState<string | null>(
    tabs?.length ? tabs[0].id.toString() : null,
  );

  const tabEntityId = tabs?.find(tab => tab.id.toString() === tabId)?.entity_id;

  return (
    <SidesheetCard>
      <EntityIdDisplay entityId={dashboard.entity_id} />
      {tabEntityId && (
        <>
          <Divider w="100%" />
          <Stack spacing="xs">
            <SidesheetCardTitle>{t`Specific tab IDs`}</SidesheetCardTitle>
            <Flex gap="md" align="center">
              <Select
                value={tabId}
                onChange={value => setTabId(value)}
                data={tabs?.map(tab => ({
                  value: tab.id.toString(),
                  label: tab.name,
                }))}
                style={{ flex: 1 }}
              />
              <Flex gap="sm" wrap="nowrap">
                {tabEntityId}
                <CopyButton className={S.CopyButton} value={tabEntityId} />
              </Flex>
            </Flex>
          </Stack>
        </>
      )}
    </SidesheetCard>
  );
};
