import type { ReactNode } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";

import { SectionLayout } from "../../components/SectionLayout";

type SegmentsSectionLayoutProps = {
  children?: ReactNode;
};

export function SegmentsSectionLayout({
  children,
}: SegmentsSectionLayoutProps) {
  usePageTitle(t`Segments`, { titleIndex: 1 });
  return <SectionLayout>{children}</SectionLayout>;
}
