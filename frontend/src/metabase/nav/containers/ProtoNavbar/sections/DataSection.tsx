import type { Location } from "history";
import { t } from "ttag";

import * as Urls from "metabase/urls";

import { SidebarLink } from "../../MainNavbar/SidebarItems";
import { SubNavHeading, SubNavSection } from "../SubNav";

type Props = { location: Location };

const BROWSE_DATABASES_URL = "/browse/databases";
const METADATA_EDITOR_URL = Urls.dataStudioData();
const SCHEMA_VIEWER_URL = Urls.dataStudioSchemaViewer();

// The Data Studio data-operations nav items, split into "Connected data"
// (browse + metadata tools) and "Data transformation".
export function DataSection({ location }: Props) {
  const path = location.pathname;

  const isTransforms =
    path.startsWith("/data-studio/transforms") &&
    !path.startsWith("/data-studio/transforms/jobs") &&
    !path.startsWith("/data-studio/transforms/runs");

  return (
    <>
      <SubNavSection>
        <SubNavHeading>{t`Connected data`}</SubNavHeading>
        <SidebarLink
          icon="database"
          url={BROWSE_DATABASES_URL}
          isSelected={path.startsWith(BROWSE_DATABASES_URL)}
        >
          {t`Databases`}
        </SidebarLink>
        <SidebarLink
          icon="table"
          url={METADATA_EDITOR_URL}
          isSelected={path.startsWith(METADATA_EDITOR_URL)}
        >
          {t`Metadata editor`}
        </SidebarLink>
        <SidebarLink
          icon="schema"
          url={SCHEMA_VIEWER_URL}
          isSelected={path.startsWith(SCHEMA_VIEWER_URL)}
        >
          {t`Schema viewer`}
        </SidebarLink>
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
