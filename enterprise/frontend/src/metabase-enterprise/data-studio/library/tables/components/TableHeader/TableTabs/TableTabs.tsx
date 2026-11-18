import { t } from "ttag";

import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import { isEventTable } from "metabase/data-studio/data-model/pages/DataModel/TableSection/EventSettings";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { type Location, useLocation } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

type TableTabsProps = {
  table: Table;
};

export function TableTabs({ table }: TableTabsProps) {
  const location = useLocation();
  const tabs = getTabs(table, location);
  return <PillTabNavigation tabs={tabs} />;
}

function getTabs(
  table: Table,
  location: Omit<Location, "query" | "action">,
): PillTab[] {
  const tabs: PillTab[] = [];

  tabs.push({
    label: t`Overview`,
    to: Urls.dataStudioTable(table.id),
  });

  const eventsUrl = Urls.dataStudioTableEvents(table.id);
  if (isEventTable(table) || location.pathname === eventsUrl) {
    tabs.push({
      label: t`Events`,
      to: eventsUrl,
    });
  }

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
