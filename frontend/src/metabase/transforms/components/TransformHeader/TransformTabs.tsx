import { t } from "ttag";

import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import { useWorktreeId } from "metabase/common/worktrees";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import * as Urls from "metabase/urls";
import type { Transform, TransformId, WorktreeId } from "metabase-types/api";

type TransformTabsProps = {
  transform: Transform;
};

export const TransformTabs = ({ transform }: TransformTabsProps) => {
  const worktreeId = useWorktreeId();
  const tabs = getTabs(transform.id, worktreeId);
  return <PillTabNavigation tabs={tabs} />;
};

function getTabs(id: TransformId, worktreeId?: WorktreeId): PillTab[] {
  const inspectUrl = Urls.transformInspect(id);
  const isWorktree = worktreeId != null;
  const tabs: PillTab[] = [
    {
      label: t`Definition`,
      to: Urls.transform(id, { worktreeId }),
    },
    // A worktree transform never runs, so its run history, target-table
    // indexes, and inspector have nothing to show.
    ...(isWorktree
      ? []
      : [
          {
            label: t`Run`,
            to: Urls.transformRun(id),
          },
        ]),
    {
      label: t`Settings`,
      to: Urls.transformSettings(id, { worktreeId }),
    },
    ...(isWorktree
      ? []
      : [
          {
            label: t`Indexes`,
            to: Urls.transformIndexes(id),
          },
        ]),
  ];

  if (PLUGIN_TRANSFORMS_PYTHON.shouldShowInspectTab && !isWorktree) {
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
      to: Urls.transformDependencies(id, { worktreeId }),
    });
  }

  return tabs;
}
