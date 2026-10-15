import { t } from "ttag";

import { CollapseSection } from "metabase/common/components/CollapseSection";
import {
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/Sidebar";
import { useListDataAppsQuery } from "metabase-enterprise/api";

import { DataAppNavbarLink } from "./DataAppNavbarLink";

export function DataAppsNavbarSection({
  onItemSelect,
}: {
  onItemSelect: () => void;
}) {
  const { data: dataApps = [] } = useListDataAppsQuery({ available: true });

  if (dataApps.length === 0) {
    return null;
  }

  return (
    <SidebarSection>
      <CollapseSection
        header={<SidebarHeading>{t`Data apps`}</SidebarHeading>}
        initialState="expanded"
        iconPosition="right"
        iconSize={8}
        aria-label={t`Data apps`}
      >
        {dataApps.map((dataApp) => (
          <DataAppNavbarLink
            key={dataApp.name}
            dataApp={dataApp}
            onItemSelect={onItemSelect}
          />
        ))}
      </CollapseSection>
    </SidebarSection>
  );
}
