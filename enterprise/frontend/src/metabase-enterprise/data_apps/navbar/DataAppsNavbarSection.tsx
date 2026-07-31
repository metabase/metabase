import { t } from "ttag";

import { CollapseSection } from "metabase/common/components/CollapseSection";
import {
  PaddedSidebarLink,
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import { useSelector } from "metabase/redux";
import { getSetting } from "metabase/selectors/settings";
import * as Urls from "metabase/urls";
import { useListDataAppsQuery } from "metabase-enterprise/api";

import { getCrossOriginDataAppHref } from "../lib/get-cross-origin-data-app-href";

export function DataAppsNavbarSection({
  onItemSelect,
}: {
  onItemSelect: () => void;
}) {
  const { data: dataApps = [] } = useListDataAppsQuery({ available: true });
  const appsHost = useSelector((state) => getSetting(state, "data-apps-host"));
  const siteUrl = useSelector((state) => getSetting(state, "site-url"));

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
          <PaddedSidebarLink
            // Data-app names are globally unique slugs, enforced by the database.
            key={dataApp.name}
            icon="app"
            onClick={onItemSelect}
            rel="noopener noreferrer"
            target="_blank"
            url={
              getCrossOriginDataAppHref(dataApp.name, appsHost, siteUrl) ??
              Urls.dataApp(dataApp.name)
            }
          >
            {dataApp.display_name}
          </PaddedSidebarLink>
        ))}
      </CollapseSection>
    </SidebarSection>
  );
}
