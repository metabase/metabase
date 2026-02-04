import type { Location } from "history";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { getLocation } from "metabase/selectors/routing";
import {
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase-enterprise/data-studio/common/components/PaneHeader";
import type { Table } from "metabase-types/api";

type TableTabsProps = {
  table: Table;
};

export function TableTabs({ table }: TableTabsProps) {
  const location = useSelector(getLocation);
  const tabs = getTabs(table, location);
  return <PaneHeaderTabs tabs={tabs} />;
}

function getTabs(table: Table, location: Location): PaneHeaderTab[] {
  const tabs: PaneHeaderTab[] = [];

  tabs.push({
    label: t`Overview`,
    to: Urls.dataStudioTable(table.id),
  });

  tabs.push({
    label: t`Fields`,
    to: Urls.dataStudioTableFields(table.id),
    isSelected: location.pathname.startsWith(
      Urls.dataStudioTableFields(table.id),
    ),
  });

  tabs.push({
    label: t`Segments`,
    to: Urls.dataStudioTableSegments(table.id),
    isSelected: location.pathname.startsWith(
      Urls.dataStudioTableSegments(table.id),
    ),
  });

  tabs.push({
    label: t`Measures`,
    to: Urls.dataStudioTableMeasures(table.id),
    isSelected: location.pathname.startsWith(
      Urls.dataStudioTableMeasures(table.id),
    ),
  });

  if (PLUGIN_DEPENDENCIES.isEnabled) {
    tabs.push({
      label: t`Dependencies`,
      to: Urls.dataStudioTableDependencies(table.id),
    });
  }

  return tabs;
}
