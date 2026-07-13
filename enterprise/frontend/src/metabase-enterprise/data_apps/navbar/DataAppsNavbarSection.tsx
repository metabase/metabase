import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { CollapseSection } from "metabase/common/components/CollapseSection";
import {
  PaddedSidebarLink,
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import type { DataAppsMainNavbarSectionProps } from "metabase/plugins/oss/data-apps";
import * as Urls from "metabase/urls";
import { useListDataAppsQuery } from "metabase-enterprise/api";

export function DataAppsNavbarSection({
  onItemSelect,
}: DataAppsMainNavbarSectionProps) {
  const { data: apps } = useListDataAppsQuery();
  const enabledApps = apps?.filter((app) => app.enabled) ?? [];

  if (enabledApps.length === 0) {
    return null;
  }

  return (
    <SidebarSection>
      <ErrorBoundary>
        <CollapseSection
          header={<SidebarHeading>{t`Data Apps`}</SidebarHeading>}
          initialState="expanded"
          iconPosition="right"
          iconSize={8}
          role="section"
          aria-label={t`Data Apps`}
        >
          {enabledApps.map((app) => (
            <PaddedSidebarLink
              key={app.id}
              icon="app"
              url={Urls.dataApp(app.name)}
              onClick={onItemSelect}
            >
              {app.display_name}
            </PaddedSidebarLink>
          ))}
        </CollapseSection>
      </ErrorBoundary>
    </SidebarSection>
  );
}
