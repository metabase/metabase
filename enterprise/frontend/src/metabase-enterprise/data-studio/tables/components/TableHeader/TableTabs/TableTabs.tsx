import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import {
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase-enterprise/data-studio/common/components/PaneHeader";
import type { Table } from "metabase-types/api";

type TableTabsProps = {
  table: Table;
};

export function TableTabs({ table }: TableTabsProps) {
  const tabs = getTabs(table);
  return <PaneHeaderTabs tabs={tabs} />;
}

function getTabs(table: Table): PaneHeaderTab[] {
  const tabs: PaneHeaderTab[] = [];
  tabs.push({
    label: t`Overview`,
    to: Urls.dataStudioTable(table.id),
  });

  if (PLUGIN_DEPENDENCIES.isEnabled) {
    tabs.push({
      label: t`Dependencies`,
      to: Urls.dataStudioTableDependencies(table.id),
    });
  }

  return tabs;
}
