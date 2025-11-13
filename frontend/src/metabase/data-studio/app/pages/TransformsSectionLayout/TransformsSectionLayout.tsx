import type { Location } from "history";
import type { ReactNode } from "react";
import { t } from "ttag";

import { SectionLayout } from "metabase/data-studio/app/components/SectionLayout";
import * as Urls from "metabase/lib/urls";
import { Group } from "metabase/ui";

import { type PaneHeaderTab, PaneHeaderTabs } from "../../../common/PaneHeader";

type TransformsSectionLayoutProps = {
  location: Location;
  children?: ReactNode;
};

export function TransformsSectionLayout({
  location,
  children,
}: TransformsSectionLayoutProps) {
  return (
    <SectionLayout tabs={<DataSectionTabs location={location} />}>
      {children}
    </SectionLayout>
  );
}

type DataSectionTabsProps = {
  location: Location;
};

function DataSectionTabs({ location }: DataSectionTabsProps) {
  return (
    <Group>
      <PaneHeaderTabs tabs={getTabs(location)} withBackground />
    </Group>
  );
}

function getTabs({ pathname }: Location): PaneHeaderTab[] {
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
