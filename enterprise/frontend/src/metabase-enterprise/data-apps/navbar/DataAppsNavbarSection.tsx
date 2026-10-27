import { t } from "ttag";

import { CollapseSection } from "metabase/common/components/CollapseSection";
import {
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/Sidebar";
import { SidebarLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import { useSetting } from "metabase/settings";
import * as Urls from "metabase/urls";
import { useListDataAppsQuery } from "metabase-enterprise/api";

import { getCrossOriginDataAppHref } from "../host/lib/get-cross-origin-data-app-href";

export function DataAppsNavbarSection({
  onItemSelect,
}: {
  onItemSelect: () => void;
}) {
  const { data: allDataApps = [] } = useListDataAppsQuery();
  const dataApps = allDataApps.filter(
    (dataApp) => dataApp.enabled && !dataApp.outdated,
  );
  const isolatedOrigin = useSetting("isolated-origin");
  const siteUrl = useSetting("site-url");

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
            url={
              getCrossOriginDataAppHref(
                dataApp.name,
                isolatedOrigin,
                siteUrl,
              ) ?? Urls.dataApp(dataApp.name)
            }
          >
            {dataApp.display_name}
          </SidebarLink>
        ))}
      </CollapseSection>
    </SidebarSection>
  );
}
