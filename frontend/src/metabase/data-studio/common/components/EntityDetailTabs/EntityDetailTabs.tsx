import { t } from "ttag";

import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import { PLUGIN_DATA_TESTING, PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { useLocation } from "metabase/router";

export type EntityDetailTabUrls = {
  definition: string;
  revisions: string;
  dependencies: string;
  tests?: string;
};

type EntityDetailTabsProps = {
  urls: EntityDetailTabUrls;
};

export function EntityDetailTabs({ urls }: EntityDetailTabsProps) {
  const location = useLocation();

  const tabs: PillTab[] = [
    {
      label: t`Definition`,
      to: urls.definition,
    },
    {
      label: t`Revision history`,
      to: urls.revisions,
      isSelected: location.pathname.startsWith(urls.revisions),
    },
  ];

  if (PLUGIN_DATA_TESTING.isEnabled && urls.tests != null) {
    tabs.push({
      label: t`Tests`,
      to: urls.tests,
      isSelected: location.pathname.startsWith(urls.tests),
    });
  }

  if (PLUGIN_DEPENDENCIES.isEnabled) {
    tabs.push({
      label: t`Dependencies`,
      to: urls.dependencies,
      isSelected: location.pathname.startsWith(urls.dependencies),
    });
  }

  return <PillTabNavigation tabs={tabs} />;
}
