import type { ReactNode } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";

import { SectionLayout } from "../../components/SectionLayout";

type ReplaceDataSourceSectionLayoutProps = {
  children?: ReactNode;
};

export function ReplaceDataSourceSectionLayout({
  children,
}: ReplaceDataSourceSectionLayoutProps) {
  usePageTitle(t`Find and replace a data source`);

  return <SectionLayout>{children}</SectionLayout>;
}
