import { t } from "ttag";

import {
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase/data-studio/common/components/PaneHeader";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import * as Urls from "metabase/utils/urls";
import type { Transform, TransformId } from "metabase-types/api";

type TransformTabsProps = {
  transform: Transform;
};

export const TransformTabs = ({ transform }: TransformTabsProps) => {
  const tabs = getTabs(transform.id);
  return <PaneHeaderTabs tabs={tabs} />;
};

function getTabs(id: TransformId): PaneHeaderTab[] {
  const inspectUrl = Urls.transformInspect(id);
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
      to: inspectUrl,
      isGated: !PLUGIN_TRANSFORMS_PYTHON.isEnabled,
      isSelected: (pathname: string) => pathname.startsWith(inspectUrl),
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
