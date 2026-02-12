import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";

import { SectionLayout } from "../../components/SectionLayout";

type WorkspacesSectionLayoutProps = {
  children?: React.ReactNode;
};

export function WorkspacesSectionLayout({
  children,
}: WorkspacesSectionLayoutProps) {
  usePageTitle(t`Workspaces`);

  return <SectionLayout>{children}</SectionLayout>;
}
