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
  children?: ReactNode;
};

export function TasksSectionLayout({ children }: TasksSectionLayoutProps) {
  usePageTitle(t`Unreferenced items`);

  return <SectionLayout tabs={<TasksTabs />}>{children}</SectionLayout>;
}

function TasksTabs() {
  return <PaneHeaderTabs tabs={getTabs()} withBackground />;
}

function getTabs(): PaneHeaderTab[] {
  return [
    {
      label: t`Broken`,
      to: Urls.dataStudioBrokenItems(),
      icon: "warning",
    },
    {
      label: t`Unreferenced`,
      to: Urls.dataStudioUnreferencedItems(),
      icon: "link",
    },
  ];
}
