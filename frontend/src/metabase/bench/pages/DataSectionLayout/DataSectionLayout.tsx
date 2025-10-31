import type { Location } from "history";
import type { ReactNode } from "react";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";

import {
  BenchSectionLayout,
  type BenchSectionTab,
  BenchSectionTabs,
  BenchSectionTitle,
} from "../../components/BenchSectionLayout";

type DataSectionLayoutProps = {
  location: Location;
  children?: ReactNode;
};

export function DataSectionLayout({
  location,
  children,
}: DataSectionLayoutProps) {
  const tabs = getTabs();

  return (
    <BenchSectionLayout
      title={
        <BenchSectionTitle
          title={t`Data structure`}
          description={t`Explore and manage your data assets`}
        />
      }
      tabs={<BenchSectionTabs tabs={tabs} location={location} />}
    >
      {children}
    </BenchSectionLayout>
  );
}

function getTabs(): BenchSectionTab[] {
  return [
    { label: t`Data`, to: Urls.bench() },
    { label: t`Transforms`, to: Urls.transformList() },
  ];
}
