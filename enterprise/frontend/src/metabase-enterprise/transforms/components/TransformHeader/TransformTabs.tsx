import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import {
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase-enterprise/data-studio/common/components/PaneHeader";
import type { Transform, TransformId } from "metabase-types/api";

type TransformTabsProps = {
  transform: Transform;
};

export const TransformTabs = ({ transform }: TransformTabsProps) => {
  const tabs = getTabs(transform.id);
  return <PaneHeaderTabs tabs={tabs} />;
};

function getTabs(id: TransformId): PaneHeaderTab[] {
  const tabs: PaneHeaderTab[] = [
    {
      label: t`Definition`,
      to: Urls.transform(id),
    },
    {
      label: t`Run`,
      to: Urls.transformRun(id),
    },
    {
      label: t`Settings`,
      to: Urls.transformSettings(id),
    },
    {
      label: t`Inspect`,
      to: Urls.transformInspect(id),
    },
  ];

  if (PLUGIN_DEPENDENCIES.isEnabled) {
    tabs.push({
      label: t`Dependencies`,
      to: Urls.transformDependencies(id),
    });
  }

  return tabs;
}
