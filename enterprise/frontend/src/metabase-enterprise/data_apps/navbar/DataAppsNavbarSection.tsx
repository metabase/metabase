import { t } from "ttag";

import { CollapseSection } from "metabase/common/components/CollapseSection";
import {
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/Sidebar";
import { SidebarLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import * as Urls from "metabase/urls";
import { useListDataAppsQuery } from "metabase-enterprise/api";

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
          <SidebarLink
            key={dataApp.name}
            icon="app"
            onClick={onItemSelect}
            rel="noopener noreferrer"
            target="_blank"
            url={Urls.dataApp(dataApp.name)}
          >
            {dataApp.display_name}
          </SidebarLink>
        ))}
      </CollapseSection>
    </SidebarSection>
  );
}
