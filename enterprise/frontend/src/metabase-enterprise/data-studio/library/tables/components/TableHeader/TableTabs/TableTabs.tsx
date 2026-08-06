import { t } from "ttag";

import {
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase/common/data-studio/components/PaneHeader";
import { useWorktreeId } from "metabase/common/worktrees";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { type Location, useLocation } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Table, WorktreeId } from "metabase-types/api";

type TableTabsProps = {
  table: Table;
};

export function TableTabs({ table }: TableTabsProps) {
  const location = useLocation();
  const worktreeId = useWorktreeId();
  const tabs = getTabs(table, location, worktreeId);
  return <PaneHeaderTabs tabs={tabs} />;
}

function getTabs(
  table: Table,
  location: Omit<Location, "query" | "action">,
  worktreeId: WorktreeId | undefined,
): PaneHeaderTab[] {
  const tabs: PaneHeaderTab[] = [];

  tabs.push({
    label: t`Overview`,
    to: Urls.dataStudioTable(table.id, { worktreeId }),
  });

  tabs.push({
    label: t`Fields`,
    to: Urls.dataStudioTableFields(table.id, undefined, { worktreeId }),
    isSelected: location.pathname.startsWith(
      Urls.dataStudioTableFields(table.id, undefined, { worktreeId }),
    ),
  });

  tabs.push({
    label: t`Segments`,
    to: Urls.dataStudioTableSegments(table.id, { worktreeId }),
    isSelected: location.pathname.startsWith(
      Urls.dataStudioTableSegments(table.id, { worktreeId }),
    ),
  });

  tabs.push({
    label: t`Measures`,
    to: Urls.dataStudioTableMeasures(table.id, { worktreeId }),
    isSelected: location.pathname.startsWith(
      Urls.dataStudioTableMeasures(table.id, { worktreeId }),
    ),
  });

  if (PLUGIN_DEPENDENCIES.isEnabled) {
    tabs.push({
      label: t`Dependencies`,
      to: Urls.dataStudioTableDependencies(table.id, { worktreeId }),
    });
  }

  return tabs;
}
