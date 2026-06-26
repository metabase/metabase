import type { Location } from "history";
import { t } from "ttag";

import { useListCollectionsTreeQuery } from "metabase/api";
import { NavbarLibrarySection } from "metabase/nav/containers/MainNavbar/NavbarLibrarySection";
import * as Urls from "metabase/urls";

import { SidebarLink } from "../../MainNavbar/SidebarItems";
import { SubNavSection } from "../SubNav";

type Props = { location: Location };

// The Library section: the Library landing page plus the Data and Metrics
// library trees (moved out of the old Collections sidebar), and Glossary.
export function LibrarySection({ location }: Props) {
  const path = location.pathname;

  const { data: collections = [] } = useListCollectionsTreeQuery({
    "exclude-other-user-collections": true,
    "exclude-archived": true,
    "include-library": true,
  });

  return (
    <>
      <SubNavSection>
        <SidebarLink
          icon="repository"
          url={Urls.dataStudioLibrary()}
          isSelected={path.startsWith("/data-studio/library")}
        >
          {t`Library`}
        </SidebarLink>
        <SidebarLink
          icon="glossary"
          url={Urls.dataStudioGlossary()}
          isSelected={path.startsWith("/data-studio/glossary")}
        >
          {t`Glossary`}
        </SidebarLink>
      </SubNavSection>

      <NavbarLibrarySection collections={collections} onItemSelect={() => {}} />
    </>
  );
}
