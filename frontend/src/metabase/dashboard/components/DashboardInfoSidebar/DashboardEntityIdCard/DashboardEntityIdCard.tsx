import { useState } from "react";
import { t } from "ttag";

import {
  SidesheetCard,
  SidesheetCardTitle,
} from "metabase/common/components/Sidesheet";
import { useHasTokenFeature } from "metabase/common/hooks";
import {
  EntityCopyButton,
  EntityInfoIcon,
} from "metabase/components/EntityIdCard";
import { isWithinIframe } from "metabase/lib/dom";
import { Collapse, Divider, Group, Icon, Stack, Text } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import Styles from "./DashboardEntityIdCard.module.css";

export const DashboardEntityIdCard = ({
  dashboard,
}: {
  dashboard: Dashboard;
}) => {
  const { tabs } = dashboard;
  // The id of the tab currently selected in the dropdown
  const [opened, setOpened] = useState<boolean>(false);

  if (!useHasTokenFeature("serialization") || isWithinIframe()) {
    return null;
  }

  return (
    <SidesheetCard>
      <Group
        justify="space-between"
        onClick={() => setOpened((x) => !x)}
        className={Styles.CollapseButton}
      >
        <Stack gap="0.25rem">
          <SidesheetCardTitle
            mb={0}
            c="inherit"
          >{t`Entity ID`}</SidesheetCardTitle>
          <Group>
            <Text c="inherit">{t`Useful when using serialization or embedding`}</Text>
            <EntityInfoIcon />
          </Group>
        </Stack>
        <Icon name={opened ? "chevronup" : "chevrondown"} />
      </Group>

      <Collapse in={opened} role="list">
        <Divider mb="0.75rem" />
        <Stack gap="0.5rem">
          <Group
            justify="space-between"
            role="listitem"
            aria-label={t`This dashboard`}
          >
            <Text>{t`This dashboard`}</Text>
            <EntityCopyButton entityId={dashboard.entity_id} />
          </Group>
          {tabs?.map((tab) =>
            tab.entity_id ? (
              <Group
                justify="space-between"
                key={tab.id}
                role="listitem"
                aria-label={tab.name}
              >
                <Text>{tab.name}</Text>
                <EntityCopyButton entityId={tab.entity_id} />
              </Group>
            ) : null,
          )}
        </Stack>
      </Collapse>
    </SidesheetCard>
  );
};
