import type { ReactNode } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";

import { SectionLayout } from "../../components/SectionLayout";

type MetricsSectionLayoutProps = {
  children?: ReactNode;
};

export function MetricsSectionLayout({ children }: MetricsSectionLayoutProps) {
  usePageTitle(t`Metrics`, { titleIndex: 1 });
  return <SectionLayout>{children}</SectionLayout>;
}
