import type { ReactNode } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { trackDataStudioDependencyGraphOpened } from "metabase-enterprise/data-studio/analytics";

import { SectionLayout, SectionTitle } from "../../components/SectionLayout";

type DependenciesSectionLayoutProps = {
  children?: ReactNode;
};

export function DependenciesSectionLayout({
  children,
}: DependenciesSectionLayoutProps) {
  usePageTitle(t`Dependency graph`);

  useMount(() => {
    trackDataStudioDependencyGraphOpened();
  });

  return (
    <SectionLayout title={<SectionTitle title={t`Dependency graph`} />}>
      {children}
    </SectionLayout>
  );
}
