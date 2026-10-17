import { t } from "ttag";

import { MonitorPillTabs } from "metabase/monitor/components/MonitorPillTabs";

import type { OAuthClientsTab } from "../OAuthClientsPage/types";

type OAuthClientsTabsProps = {
  tab: OAuthClientsTab;
  onChange: (tab: OAuthClientsTab) => void;
};

export const OAuthClientsTabs = ({ tab, onChange }: OAuthClientsTabsProps) => (
  <MonitorPillTabs
    value={tab}
    tabs={[
      { value: "active", icon: "connections", label: t`Active` },
      { value: "revoked", icon: "history", label: t`Revoked` },
    ]}
    testIdPrefix="oauth-clients"
    onChange={onChange}
  />
);
