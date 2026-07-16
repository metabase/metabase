import { t } from "ttag";

import { CollapseSection } from "metabase/common/components/CollapseSection";
import {
  PaddedSidebarLink,
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import * as Urls from "metabase/urls";
import { useListDataAppsQuery } from "metabase-enterprise/api";

export function DataAppsNavbarSection({
  onItemSelect,
}: {
  onItemSelect: () => void;
}) {
  const { data: dataApps = [] } = useListDataAppsQuery();

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
        role="section"
        aria-label={t`Data apps`}
      >
        {dataApps.map((dataApp) => (
          <PaddedSidebarLink
            key={dataApp.id}
            icon="app"
            onClick={onItemSelect}
            url={Urls.dataApp(dataApp.name)}
          >
            {dataApp.display_name}
          </PaddedSidebarLink>
        ))}
      </CollapseSection>
    </SidebarSection>
  );
}
