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

type TasksSectionLayoutProps = {
  location: Location;
  children?: ReactNode;
};

export function TasksSectionLayout({
  location,
  children,
}: TasksSectionLayoutProps) {
  usePageTitle(t`Unreferenced items`);

  return (
    <SectionLayout tabs={<TasksTabs location={location} />}>
      {children}
    </SectionLayout>
  );
}

type TasksTabsProps = {
  location: Location;
};

function TasksTabs({ location }: TasksTabsProps) {
  return <PaneHeaderTabs tabs={getTabs(location)} withBackground />;
}

function getTabs({ pathname }: Location): PaneHeaderTab[] {
  const isUnreferencedItems = pathname.startsWith(
    Urls.dataStudioUnreferencedItems(),
  );

  return [
    {
      label: t`Unreferenced`,
      to: Urls.dataStudioUnreferencedItems(),
      icon: "transform",
      isSelected: isUnreferencedItems,
    },
  ];
}
