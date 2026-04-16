import type { ReactNode } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";

import { SectionLayout } from "../../components/SectionLayout";

type MeasuresSectionLayoutProps = {
  children?: ReactNode;
};

export function MeasuresSectionLayout({
  children,
}: MeasuresSectionLayoutProps) {
  usePageTitle(t`Measures`, { titleIndex: 1 });
  return <SectionLayout>{children}</SectionLayout>;
}
