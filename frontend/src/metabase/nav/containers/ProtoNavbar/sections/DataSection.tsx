import type { Location } from "history";
import { t } from "ttag";

import * as Urls from "metabase/urls";

import { SidebarLink } from "../../MainNavbar/SidebarItems";
import { SubNavSection } from "../SubNav";

type Props = { location: Location };

// The Data Studio data-operations nav items.
export function DataSection({ location }: Props) {
  const path = location.pathname;

  const isTransforms =
    path.startsWith("/data-studio/transforms") &&
    !path.startsWith("/data-studio/transforms/jobs") &&
    !path.startsWith("/data-studio/transforms/runs");

  return (
    <SubNavSection>
      <SidebarLink
        icon="table"
        url={Urls.dataStudioData()}
        isSelected={path.startsWith("/data-studio/data")}
      >
        {t`Tables`}
      </SidebarLink>
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
        icon="network"
        url={Urls.dataStudioSchemaViewer()}
        isSelected={path.startsWith("/data-studio/schema-viewer")}
      >
        {t`Schema viewer`}
      </SidebarLink>
    </SubNavSection>
  );
}
