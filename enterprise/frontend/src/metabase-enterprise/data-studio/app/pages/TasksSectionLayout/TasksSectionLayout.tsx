import type { ReactNode } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";

import { SectionLayout } from "../../components/SectionLayout";

type TasksSectionLayoutProps = {
  children?: ReactNode;
};

export function TasksSectionLayout({ children }: TasksSectionLayoutProps) {
  usePageTitle(t`Tasks`);
  return <SectionLayout>{children}</SectionLayout>;
}
