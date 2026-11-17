import { t } from "ttag";

import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { type Location, useLocation } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

import { useTableCustomProperties } from "../../../pages/TablePropertiesPage";

type TableTabsProps = {
  table: Table;
};

export function TableTabs({ table }: TableTabsProps) {
  const location = useLocation();
  // PROTOTYPE: only tables with custom properties get a Properties tab
  const hasCustomProperties = useTableCustomProperties(table).kind != null;
  const tabs = getTabs(table, location, hasCustomProperties);
  return <PillTabNavigation tabs={tabs} />;
}

function getTabs(
  table: Table,
  location: Omit<Location, "query" | "action">,
  hasCustomProperties: boolean,
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

  if (hasCustomProperties) {
    tabs.push({
      label: t`Properties`,
      to: Urls.dataStudioTableProperties(table.id),
    });
  }

  tabs.push({
    label: t`Hierarchies`,
    to: Urls.dataStudioTableHierarchies(table.id),
    isSelected: location.pathname.startsWith(
      Urls.dataStudioTableHierarchies(table.id),
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
