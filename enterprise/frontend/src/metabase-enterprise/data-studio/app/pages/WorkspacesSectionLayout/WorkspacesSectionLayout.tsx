import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";

import { SectionLayout, SectionTitle } from "../../components/SectionLayout";

type WorkspacesSectionLayoutProps = {
  location: Location;
  children?: React.ReactNode;
};

export function WorkspacesSectionLayout({
  children,
}: WorkspacesSectionLayoutProps) {
  usePageTitle(t`Workspaces`);

  return (
    <SectionLayout title={<SectionTitle title={t`Workspaces`} />}>
      {children}
    </SectionLayout>
  );
}
