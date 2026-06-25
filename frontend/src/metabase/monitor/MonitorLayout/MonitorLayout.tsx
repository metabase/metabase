import type { ReactNode } from "react";
import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { SpaceLayout, SpaceTab } from "metabase/nav/components/SpaceLayout";
import { useSelector } from "metabase/redux";
import { getLocation } from "metabase/selectors/routing";
import { FixedSizeIcon } from "metabase/ui";
import * as Urls from "metabase/urls";

type MonitorLayoutProps = {
  children?: ReactNode;
};

export function MonitorLayout({ children }: MonitorLayoutProps) {
  const {
    value: _isNavbarOpened,
    setValue: setIsNavbarOpened,
    isLoading: isLoadingNavbarKey,
  } = useUserKeyValue({
    namespace: "monitor",
    key: "isNavbarOpened",
  });
  const isNavbarOpened = _isNavbarOpened !== false;

  const { pathname } = useSelector(getLocation);
  const hasDependenciesFeature = useHasTokenFeature("dependencies");

  const upperNav = (
    <SpaceTab
      label={t`Dependency diagnostics`}
      icon="search_check"
      to={Urls.dependencyDiagnostics()}
      isSelected={pathname.startsWith(Urls.dependencyDiagnostics())}
      showLabel={isNavbarOpened}
      isGated={!hasDependenciesFeature}
    />
  );

  return (
    <SpaceLayout
      logo={<FixedSizeIcon name="gauge" size={28} c="brand" />}
      testId="monitor-nav"
      isLoading={isLoadingNavbarKey}
      isNavbarOpened={isNavbarOpened}
      onNavbarToggle={setIsNavbarOpened}
      upperNav={upperNav}
    >
      {children}
    </SpaceLayout>
  );
}
