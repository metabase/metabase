import type { Location } from "history";
import type { ReactNode } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";

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
  const hasTransforms = useSelector(PLUGIN_TRANSFORMS.canAccessTransforms);
  const tabs = getTabs(location, hasTransforms);

  return (
    <BenchSectionLayout
      title={
        <BenchSectionTitle
          title={t`Data structure`}
          description={t`Explore and manage your data assets`}
        />
      }
      tabs={tabs.length > 0 && <BenchSectionTabs tabs={tabs} />}
    >
      {children}
    </BenchSectionLayout>
  );
}

function getTabs(
  { pathname }: Location,
  hasTransforms: boolean,
): BenchSectionTab[] {
  if (!hasTransforms) {
    return [];
  }

  return [
    {
      label: t`Data`,
      to: Urls.bench(),
      isSelected:
        pathname === Urls.bench() || pathname.startsWith(Urls.dataModel()),
    },
    {
      label: t`Transforms`,
      to: Urls.transformList(),
      isSelected: pathname.startsWith(Urls.transformList()),
    },
  ];
}
