import { getLibrarySectionName } from "metabase/common/data-studio/library-sections";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { Outlet } from "metabase/router";
import type { LibraryCollectionType } from "metabase-types/api";

type LibrarySectionLayoutProps = {
  section: LibraryCollectionType;
};

export function LibrarySectionLayout({ section }: LibrarySectionLayoutProps) {
  usePageTitle(getLibrarySectionName(section));

  return <Outlet />;
}
