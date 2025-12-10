import type { Location } from "history";
import type { ReactNode } from "react";
import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import * as Urls from "metabase/lib/urls";
import {
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase-enterprise/data-studio/common/components/PaneHeader";

import { SectionLayout } from "../../components/SectionLayout";

type TransformsSectionLayoutProps = {
  location: Location;
  children?: ReactNode;
};

export function TransformsSectionLayout({
  location,
  children,
}: TransformsSectionLayoutProps) {
  usePageTitle(t`Transforms`);

  return (
    <SectionLayout tabs={<TransformTabs location={location} />}>
      {children}
    </SectionLayout>
  );
}

type TransformTabsProps = {
  location: Location;
};

function TransformTabs({ location }: TransformTabsProps) {
  return <PaneHeaderTabs tabs={getTabs(location)} withBackground />;
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
