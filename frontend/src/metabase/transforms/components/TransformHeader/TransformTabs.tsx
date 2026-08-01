import { t } from "ttag";

import {
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase/common/data-studio/components/PaneHeader";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import { type TransformHost, useTransformHost } from "metabase/transforms/host";
import type { Transform, TransformId } from "metabase-types/api";

type TransformTabsProps = {
  transform: Transform;
};

export const TransformTabs = ({ transform }: TransformTabsProps) => {
  const host = useTransformHost();
  const tabs = getTabs(transform.id, host);
  return <PaneHeaderTabs tabs={tabs} />;
};

function getTabs(id: TransformId, host: TransformHost): PaneHeaderTab[] {
  const tabs: PaneHeaderTab[] = [
    {
      label: t`Definition`,
      to: host.getTransformUrl(id),
    },
    {
      label: t`Run`,
      to: host.getTransformRunUrl(id),
    },
    {
      label: t`Settings`,
      to: host.getTransformSettingsUrl(id),
    },
    {
      label: t`Indexes`,
      to: host.getTransformIndexesUrl(id),
    },
  ];

  const inspectUrl = host.getTransformInspectUrl?.(id);
  if (PLUGIN_TRANSFORMS_PYTHON.shouldShowInspectTab && inspectUrl != null) {
    tabs.push({
      label: t`Inspect`,
      to: inspectUrl,
      isGated: !PLUGIN_TRANSFORMS_PYTHON.isEnabled,
      isSelected: (pathname: string) => pathname.startsWith(inspectUrl),
    });
  }

  const dependenciesUrl = host.getTransformDependenciesUrl?.(id);
  if (PLUGIN_DEPENDENCIES.isEnabled && dependenciesUrl != null) {
    tabs.push({
      label: t`Dependencies`,
      to: dependenciesUrl,
    });
  }

  return tabs;
}
