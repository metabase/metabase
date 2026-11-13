import { t } from "ttag";

import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import { useIsHistoryTable } from "metabase/data-studio/data-model/pages/DataModel/TableSection/TableStructure";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { type Location, useLocation } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

import {
  type HierarchyPlacement,
  useHierarchyPlacement,
} from "../../HierarchyPlacement";

type TableTabsProps = {
  table: Table;
};

export function TableTabs({ table }: TableTabsProps) {
  const location = useLocation();
  const isHistoryTable = useIsHistoryTable(table);
  const [hierarchyPlacement] = useHierarchyPlacement();
  const tabs = getTabs(table, location, isHistoryTable, hierarchyPlacement);
  return <PillTabNavigation tabs={tabs} />;
}

function getTabs(
  table: Table,
  location: Omit<Location, "query" | "action">,
  isHistoryTable: boolean,
  hierarchyPlacement: HierarchyPlacement,
): PillTab[] {
  const tabs: PillTab[] = [];

  tabs.push({
    label: t`Overview`,
    to: Urls.dataStudioTable(table.id),
  });

  tabs.push({
    label: t`Metadata`,
    to: Urls.dataStudioTableMetadata(table.id),
  });

  tabs.push({
    label: t`Fields`,
    to: Urls.dataStudioTableFields(table.id),
    isSelected: location.pathname.startsWith(
      Urls.dataStudioTableFields(table.id),
    ),
  });

  if (isHistoryTable) {
    tabs.push({
      label: t`History`,
      to: Urls.dataStudioTableHistory(table.id),
    });
  }

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

  if (hierarchyPlacement !== "fields") {
    tabs.push({
      label: t`Hierarchies`,
      to: Urls.dataStudioTableHierarchies(table.id),
      isSelected: location.pathname.startsWith(
        Urls.dataStudioTableHierarchies(table.id),
      ),
    });
  }

  if (PLUGIN_DEPENDENCIES.isEnabled) {
    tabs.push({
      label: t`Dependencies`,
      to: Urls.dataStudioTableDependencies(table.id),
    });
  }

  return tabs;
}
