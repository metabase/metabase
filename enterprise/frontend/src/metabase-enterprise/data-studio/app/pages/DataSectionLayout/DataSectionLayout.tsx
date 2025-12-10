import type { ReactNode } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";

import { SectionLayout } from "../../components/SectionLayout";

type DataSectionLayoutProps = {
  children?: ReactNode;
};

export function DataSectionLayout({ children }: DataSectionLayoutProps) {
  usePageTitle(t`Data`);

  return <SectionLayout>{children}</SectionLayout>;
}
