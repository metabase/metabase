import type { Location } from "history";
import type { ReactNode } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { DataModelContext } from "metabase/metadata/pages/DataModel/DataModelContext";
import {
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_TRANSFORMS,
} from "metabase/plugins";

import {
  SectionLayout,
  type SectionTab,
  SectionTabs,
  SectionTitle,
} from "../../components/SectionLayout";

type DataSectionLayoutProps = {
  location: Location;
  children?: ReactNode;
};

export function DataSectionLayout({
  location,
  children,
}: DataSectionLayoutProps) {
  const canAccessDataModel = useSelector(
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel,
  );
  const canAccessTransforms = useSelector(
    PLUGIN_TRANSFORMS.canAccessTransforms,
  );
  const tabs = getTabs(location, { canAccessDataModel, canAccessTransforms });

  return (
    <SectionLayout
      title={
        <SectionTitle
          title={t`Data structure`}
          description={t`Explore and manage your data assets`}
        />
      }
      tabs={tabs.length > 0 && <SectionTabs tabs={tabs} />}
    >
      <DataModelContext.Provider value={{ baseUrl: Urls.dataStudioData() }}>
        {children}
      </DataModelContext.Provider>
    </SectionLayout>
  );
}

type FeatureOptions = {
  canAccessDataModel: boolean;
  canAccessTransforms: boolean;
};

function getTabs(
  { pathname }: Location,
  { canAccessDataModel, canAccessTransforms }: FeatureOptions,
): SectionTab[] {
  if (!canAccessDataModel || !canAccessTransforms) {
    return [];
  }

  return [
    {
      label: t`Data`,
      to: Urls.dataStudio(),
      isSelected: pathname.startsWith(Urls.dataStudioData()),
    },
    {
      label: t`Transforms`,
      to: Urls.transformList(),
      isSelected: pathname.startsWith(Urls.transformList()),
    },
  ];
}
