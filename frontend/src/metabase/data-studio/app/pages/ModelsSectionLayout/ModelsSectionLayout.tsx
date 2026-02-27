import type { ReactNode } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";

import { SectionLayout } from "../../components/SectionLayout";

type ModelsSectionLayoutProps = {
  children?: ReactNode;
};

export function ModelsSectionLayout({ children }: ModelsSectionLayoutProps) {
  usePageTitle(t`Migrate models`);

  return <SectionLayout>{children}</SectionLayout>;
}
