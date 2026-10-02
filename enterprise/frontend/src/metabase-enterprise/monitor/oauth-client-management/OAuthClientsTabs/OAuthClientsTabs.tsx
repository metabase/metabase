import { t } from "ttag";

import { Icon, Tabs } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import type {
  OAuthClientsTab,
  OAuthClientsUrlState,
} from "../OAuthClientsPage/types";

type OAuthClientsTabsProps = {
  tab: OAuthClientsTab;
  onChange: (patch: Partial<OAuthClientsUrlState>) => void;
};

type TabConfig = {
  value: OAuthClientsTab;
  icon: IconName;
  label: string;
};

export const OAuthClientsTabs = ({ tab, onChange }: OAuthClientsTabsProps) => {
  const tabs: TabConfig[] = [
    { value: "active", icon: "connections", label: t`Active` },
    { value: "revoked", icon: "history", label: t`Revoked` },
  ];

  const handleTabChange = (value: string | null) => {
    const next = tabs.find((config) => config.value === value);
    if (next !== undefined) {
      onChange({ tab: next.value });
    }
  };

  return (
    <Tabs
      variant="pills"
      value={tab}
      onChange={handleTabChange}
      data-testid="oauth-clients-tabs"
    >
      <Tabs.List>
        {tabs.map((config) => (
          <Tabs.Tab
            key={config.value}
            value={config.value}
            leftSection={<Icon name={config.icon} />}
            data-testid={`oauth-clients-tab-${config.value}`}
          >
            {config.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
};
