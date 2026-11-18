import { KBarContext, KBarProvider, useKBar, useRegisterActions } from "kbar";
import { type PropsWithChildren, useContext, useMemo } from "react";

import { getPerformanceAdminPaths } from "metabase/admin/performance/constants/complex";
import { getUserIsAdmin } from "metabase/current-user";
import type { PaletteAction } from "metabase/palette/types";
import { PLUGIN_CACHING } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getAdminPaths } from "metabase/selectors/admin";
import { type ModalOpenEffect, ModalOpenEffectProvider } from "metabase/ui";

export const AppKBarProvider = ({ children }: PropsWithChildren) => (
  <KBarProvider>
    <AppPaletteActions />
    <ModalDisablesCommandPalette>{children}</ModalDisablesCommandPalette>
  </KBarProvider>
);

const ModalDisablesCommandPalette = ({ children }: PropsWithChildren) => {
  const context = useContext(KBarContext);

  const effect = useMemo<ModalOpenEffect>(
    () => (opened) => {
      if (!context?.query) {
        return;
      }

      const { query, getState } = context;

      // A nested modal must not re-enable a palette that an outer modal
      // (or anything else) already disabled when it unmounts.
      if (getState().disabled) {
        return;
      }

      if (opened) {
        query.disable(true);

        return () => query.disable(false);
      }
    },
    [context],
  );

  return (
    <ModalOpenEffectProvider value={effect}>{children}</ModalOpenEffectProvider>
  );
};

const AppPaletteActions = () => {
  const isAdmin = useSelector(getUserIsAdmin);
  const adminPaths = useSelector(getAdminPaths);
  const { searchQuery } = useKBar((state) => ({
    searchQuery: state.searchQuery,
  }));
  const hasQuery = searchQuery.trim().length > 0;

  const adminActions = useMemo<PaletteAction[]>(() => {
    const adminSubpaths = isAdmin
      ? getPerformanceAdminPaths(PLUGIN_CACHING.getTabMetadata())
      : [];

    return [...adminPaths, ...adminSubpaths].map((adminPath) => ({
      id: `admin-page-${adminPath.key}`,
      name: adminPath.getName(),
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
