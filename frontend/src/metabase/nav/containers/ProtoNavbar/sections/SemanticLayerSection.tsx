import { t } from "ttag";

import type { Location } from "metabase/router";
import * as Urls from "metabase/urls";

import { SidebarLink } from "../../MainNavbar/SidebarItems";
import S from "../ProtoNavbar.module.css";
import { SubNavHeading, SubNavSection } from "../SubNav";

type Props = { location: Location };

// Published tables and metrics.
export function SemanticLayerSection({ location }: Props) {
  const path = location.pathname;
  const search = location.search;

  const isLibraryPage = path.startsWith("/data-studio/library");
  const librarySection = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  ).get("library");
  const isPublishedTablesSelected =
    isLibraryPage && (librarySection === "tables" || librarySection == null);

  // 2px + the icon's own 4px padding puts the icon 6px in, where the Official
  // content tree's chevrons start.
  const ROW_PADDING_LEFT = 2;

  return (
    <SubNavSection className={S.tightSection}>
      <SubNavHeading>{t`Official data`}</SubNavHeading>
      <SidebarLink
        icon="table"
        url={Urls.dataStudioLibrary({ library: "tables" })}
        isSelected={isPublishedTablesSelected}
        pl={ROW_PADDING_LEFT}
      >
        {t`Tables`}
      </SidebarLink>
      <SidebarLink
        icon="metric"
        url={Urls.dataStudioLibrary({ library: "metrics" })}
        isSelected={isLibraryPage && librarySection === "metrics"}
        pl={ROW_PADDING_LEFT}
      >
        {t`Metrics`}
      </SidebarLink>
    </SubNavSection>
  );
}
