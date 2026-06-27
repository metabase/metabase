import type { Location } from "history";
import { t } from "ttag";

import * as Urls from "metabase/urls";

import { SidebarLink } from "../../MainNavbar/SidebarItems";
import S from "../ProtoNavbar.module.css";
import { SubNavHeading, SubNavSection } from "../SubNav";

type Props = { location: Location };

// The Library section: semantic layer items plus knowledge (glossary, events).
export function LibrarySection({ location }: Props) {
  const path = location.pathname;
  const search = location.search;

  const isLibraryPage = path.startsWith("/data-studio/library");
  const isGlossaryPage = path.startsWith(Urls.dataStudioGlossary());
  const isEventsPage = path.startsWith(Urls.dataStudioEvents());

  const tablesUrl = Urls.dataStudioLibrary({ library: "tables" });
  const segmentsUrl = Urls.dataStudioLibrary({ library: "segments" });
  const measuresUrl = Urls.dataStudioLibrary({ library: "measures" });
  const metricsUrl = Urls.dataStudioLibrary({ library: "metrics" });
  const librarySection = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  ).get("library");
  const isPublishedTablesSelected =
    isLibraryPage && (librarySection === "tables" || librarySection == null);

  return (
    <>
      <SubNavSection>
        <SubNavHeading>{t`Semantic layer`}</SubNavHeading>
        <SidebarLink
          icon="table"
          url={tablesUrl}
          isSelected={isPublishedTablesSelected}
        >
          {t`Published tables`}
        </SidebarLink>
        <div className={S.libraryNestedItems}>
          <SidebarLink
            icon="segment"
            url={segmentsUrl}
            isSelected={isLibraryPage && librarySection === "segments"}
          >
            {t`Segments`}
          </SidebarLink>
          <SidebarLink
            icon="sum"
            url={measuresUrl}
            isSelected={isLibraryPage && librarySection === "measures"}
          >
            {t`Measures`}
          </SidebarLink>
        </div>
        <SidebarLink
          icon="metric"
          url={metricsUrl}
          isSelected={isLibraryPage && librarySection === "metrics"}
        >
          {t`Metrics`}
        </SidebarLink>
      </SubNavSection>

      <SubNavSection>
        <SubNavHeading>{t`Knowledge`}</SubNavHeading>
        <SidebarLink
          icon="glossary"
          url={Urls.dataStudioGlossary()}
          isSelected={isGlossaryPage}
        >
          {t`Glossary`}
        </SidebarLink>
        <SidebarLink
          icon="calendar"
          url={Urls.dataStudioEvents()}
          isSelected={isEventsPage}
        >
          {t`Events`}
        </SidebarLink>
      </SubNavSection>
    </>
  );
}
