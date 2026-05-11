import { KBarProvider, useKBar, useRegisterActions } from "kbar";
import { type PropsWithChildren, useMemo } from "react";

import { getAdminPaths } from "metabase/admin/app/selectors";
import { getPerformanceAdminPaths } from "metabase/admin/performance/constants/complex";
import type { PaletteAction } from "metabase/palette/types";
import { PLUGIN_CACHING } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";

export const AppKBarProvider = ({ children }: PropsWithChildren) => (
  <KBarProvider>
    <AppPaletteActions />
    {children}
  </KBarProvider>
);

const AppPaletteActions = () => {
  const isAdmin = useSelector(getUserIsAdmin);
  const adminPaths = useSelector(getAdminPaths);
  const { searchQuery } = useKBar((state) => ({
    searchQuery: state.searchQuery,
  }));
  const hasQuery = searchQuery.length > 0;

  const adminActions = useMemo<PaletteAction[]>(() => {
    const adminSubpaths = isAdmin
      ? getPerformanceAdminPaths(PLUGIN_CACHING.getTabMetadata())
      : [];

    return [...adminPaths, ...adminSubpaths].map((adminPath) => ({
      id: `admin-page-${adminPath.key}`,
      name: adminPath.name,
      icon: "gear",
      perform: () => {},
      section: "admin",
      extra: {
        href: adminPath.path,
      },
    }));
  }, [isAdmin, adminPaths]);

  useRegisterActions(hasQuery ? adminActions : [], [adminActions, hasQuery]);

  return null;
};
