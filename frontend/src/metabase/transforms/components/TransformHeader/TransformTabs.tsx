import { t } from "ttag";

import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import * as Urls from "metabase/urls";
import type { Transform } from "metabase-types/api";

type TransformTabsProps = {
  transform: Transform;
};

export const TransformTabs = ({ transform }: TransformTabsProps) => {
  const tabs = getTabs(transform);
  return <PillTabNavigation tabs={tabs} />;
};

function getTabs({ id, source }: Transform): PillTab[] {
  const inspectUrl = Urls.transformInspect(id);
  const tabs: PillTab[] = [
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
  ];

  if (source.type === "query") {
    tabs.push({
      label: t`Classify`,
      to: Urls.transformClassify(id),
    });
  }

  tabs.push({
    label: t`Indexes`,
    to: Urls.transformIndexes(id),
  });

  if (PLUGIN_TRANSFORMS_PYTHON.shouldShowInspectTab) {
    tabs.push({
      label: t`Inspect`,
      to: inspectUrl,
      isGated: !PLUGIN_TRANSFORMS_PYTHON.isEnabled,
      isSelected: (pathname: string) => pathname.startsWith(inspectUrl),
    });
  }

  if (PLUGIN_DEPENDENCIES.isEnabled) {
    tabs.push({
      label: t`Dependencies`,
      to: Urls.transformDependencies(id),
    });
  }

  return tabs;
}
