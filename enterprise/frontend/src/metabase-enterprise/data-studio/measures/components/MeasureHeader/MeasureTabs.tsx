import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { getLocation } from "metabase/selectors/routing";
import {
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase-enterprise/data-studio/common/components/PaneHeader";
import type { MeasureTabUrls } from "metabase-enterprise/data-studio/measures/layouts/MeasureLayout";

type MeasureTabsProps = {
  urls: MeasureTabUrls;
};

export function MeasureTabs({ urls }: MeasureTabsProps) {
  const location = useSelector(getLocation);

  const tabs: PaneHeaderTab[] = [
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

  if (PLUGIN_DEPENDENCIES.isEnabled) {
    tabs.push({
      label: t`Dependencies`,
      to: urls.dependencies,
      isSelected: location.pathname.startsWith(urls.dependencies),
    });
  }

  return <PaneHeaderTabs tabs={tabs} />;
}
