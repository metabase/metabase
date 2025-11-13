import type { ReactNode } from "react";
import { t } from "ttag";

import {
  SectionLayout,
  SectionTitle,
} from "metabase/data-studio/app/components/SectionLayout";
import * as Urls from "metabase/lib/urls";
import { DataModelContext } from "metabase/metadata/pages/DataModel/DataModelContext";

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
