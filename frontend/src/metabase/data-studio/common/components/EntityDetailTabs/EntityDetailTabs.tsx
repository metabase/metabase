import { t } from "ttag";

import {
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase/data-studio/common/components/PaneHeader";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { getLocation } from "metabase/selectors/routing";

export type EntityDetailTabUrls = {
  definition: string;
  revisions: string;
  dependencies: string;
};

type EntityDetailTabsProps = {
  urls: EntityDetailTabUrls;
};

export function EntityDetailTabs({ urls }: EntityDetailTabsProps) {
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
