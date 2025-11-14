import type { ReactNode } from "react";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { DataModelContext } from "metabase/metadata/pages/shared";

import { SectionLayout, SectionTitle } from "../../components/SectionLayout";

type DataSectionLayoutProps = {
  children?: ReactNode;
};

export function DataSectionLayout({ children }: DataSectionLayoutProps) {
  return (
    <SectionLayout title={<SectionTitle title={t`Data`} />}>
      <DataModelContext.Provider value={{ baseUrl: Urls.dataStudioData() }}>
        {children}
      </DataModelContext.Provider>
    </SectionLayout>
  );
}
