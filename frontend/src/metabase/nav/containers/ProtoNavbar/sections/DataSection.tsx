import { useDisclosure } from "@mantine/hooks";
import type { Location } from "history";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { AddDataModal } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal";
import { useAddDataPermissions } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal/use-add-data-permission";
import { trackAddDataModalOpened } from "metabase/nav/containers/MainNavbar/analytics";
import { Icon } from "metabase/ui";
import * as Urls from "metabase/urls";

import { SidebarLink } from "../../MainNavbar/SidebarItems";
import S from "../ProtoNavbar.module.css";
import { SubNavHeading, SubNavSection } from "../SubNav";

type Props = { location: Location };

// The Data Studio data-operations nav items, split into "Databases" (one item
// per database, scoped to that database) and "Data transformation".
export function DataSection({ location }: Props) {
  const path = location.pathname;

  const { data: databasesData } = useListDatabasesQuery();
  const databases = databasesData?.data ?? [];
  const { canPerformMeaningfulActions } = useAddDataPermissions();
  const [
    addDataModalOpened,
    { open: openAddDataModal, close: closeAddDataModal },
  ] = useDisclosure(false);

  const isTransforms =
    path.startsWith("/data-studio/transforms") &&
    !path.startsWith("/data-studio/transforms/jobs") &&
    !path.startsWith("/data-studio/transforms/runs");

  return (
    <>
      <SubNavSection>
        {canPerformMeaningfulActions && (
          <button
            type="button"
            className={S.navActionButton}
            aria-label={t`Add data`}
            onClick={() => {
              trackAddDataModalOpened("left-nav");
              openAddDataModal();
            }}
          >
            <span className={S.navActionIconCircle}>
              <Icon name="add" size={12} />
            </span>
            {t`Add data`}
          </button>
        )}
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

      <AddDataModal opened={addDataModalOpened} onClose={closeAddDataModal} />
    </>
  );
}
