import type { ReactNode } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import * as Urls from "metabase/lib/urls";
import { DataModelContext } from "metabase/metadata/pages/shared";

import { SectionLayout, SectionTitle } from "../../components/SectionLayout";

type DataSectionLayoutProps = {
  children?: ReactNode;
};

export function DataSectionLayout({ children }: DataSectionLayoutProps) {
  usePageTitle(t`Data`);

  return (
    <SectionLayout title={<SectionTitle title={t`Data`} />}>
      <DataModelContext.Provider value={{ baseUrl: Urls.dataStudioData() }}>
        {children}
      </DataModelContext.Provider>
    </SectionLayout>
  );
}
