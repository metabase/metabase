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
import { Group } from "metabase/ui";

import {
  type PaneHeaderTab,
  PaneHeaderTabs,
  PaneHeaderTabsDivider,
} from "../../components/PaneHeader";
import { SectionLayout, SectionTitle } from "../../components/SectionLayout";

type DataSectionLayoutProps = {
  location: Location;
  children?: ReactNode;
};

export function DataSectionLayout({
  location,
  children,
}: DataSectionLayoutProps) {
  return (
    <SectionLayout
      title={<SectionTitle title={t`Data structure`} />}
      tabs={<DataSectionTabs location={location} />}
    >
      <DataModelContext.Provider value={{ baseUrl: Urls.dataStudioData() }}>
        {children}
      </DataModelContext.Provider>
    </SectionLayout>
  );
}

type DataSectionTabsProps = {
  location: Location;
};

function DataSectionTabs({ location }: DataSectionTabsProps) {
  const canAccessDataModel = useSelector(
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel,
  );
  const canAccessTransforms = useSelector(
    PLUGIN_TRANSFORMS.canAccessTransforms,
  );

  return (
    <Group>
      {canAccessDataModel && <PaneHeaderTabs tabs={getDataTabs(location)} />}
      {canAccessDataModel && canAccessTransforms && <PaneHeaderTabsDivider />}
      {canAccessTransforms && (
        <PaneHeaderTabs tabs={getTransformTabs(location)} withBackground />
      )}
    </Group>
  );
}

function getDataTabs({ pathname }: Location): PaneHeaderTab[] {
  return [
    {
      label: t`Data`,
      to: Urls.dataStudio(),
      isSelected: pathname.startsWith(Urls.dataStudioData()),
    },
  ];
}

function getTransformTabs({ pathname }: Location): PaneHeaderTab[] {
  const isTransforms = pathname.startsWith(Urls.transformList());
  const isJobs = pathname.startsWith(Urls.transformJobList());
  const isRuns = pathname.startsWith(Urls.transformRunList());

  return [
    {
      label: t`Transforms`,
      to: Urls.transformList(),
      icon: "transform",
      isSelected: isTransforms && !isJobs && !isRuns,
    },
    {
      label: t`Jobs`,
      to: Urls.transformJobList(),
      icon: "clock",
      isSelected: isJobs,
    },
    {
      label: t`Runs`,
      to: Urls.transformRunList(),
      icon: "play",
      isSelected: isRuns,
    },
  ];
}
