import type { Location } from "history";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import * as Urls from "metabase/urls";

import { SidebarLink } from "../../MainNavbar/SidebarItems";
import { SubNavHeading, SubNavSection } from "../SubNav";

type Props = { location: Location };

// The Data Studio data-operations nav items, split into "Databases" (one item
// per database, scoped to that database) and "Data transformation".
export function DataSection({ location }: Props) {
  const path = location.pathname;

  const { data: databasesData } = useListDatabasesQuery();
  const databases = databasesData?.data ?? [];

  const isTransforms =
    path.startsWith("/data-studio/transforms") &&
    !path.startsWith("/data-studio/transforms/jobs") &&
    !path.startsWith("/data-studio/transforms/runs");

  return (
    <>
      <SubNavSection>
        <SubNavHeading>{t`Databases`}</SubNavHeading>
        {databases.map((database) => {
          const url = Urls.dataStudioData({ databaseId: database.id });
          return (
            <SidebarLink
              key={database.id}
              icon="database"
              url={url}
              isSelected={path.startsWith(url)}
            >
              {database.name}
            </SidebarLink>
          );
        })}
      </SubNavSection>

      <SubNavSection>
        <SubNavHeading>{t`Data transformation`}</SubNavHeading>
        <SidebarLink
          icon="transform"
          url={Urls.transformList()}
          isSelected={isTransforms}
        >
          {t`Transforms`}
        </SidebarLink>
        <SidebarLink
          icon="clock"
          url={Urls.transformJobList()}
          isSelected={path.startsWith("/data-studio/transforms/jobs")}
        >
          {t`Jobs`}
        </SidebarLink>
        <SidebarLink
          icon="play_outlined"
          url={Urls.transformRunList()}
          isSelected={path.startsWith("/data-studio/transforms/runs")}
        >
          {t`Runs`}
        </SidebarLink>
        <SidebarLink
          icon="workspace"
          url={Urls.workspaces()}
          isSelected={path.startsWith(Urls.workspaces())}
        >
          {t`Workspaces`}
        </SidebarLink>
      </SubNavSection>
    </>
  );
}
