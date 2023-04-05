import React, { useCallback, useMemo } from "react";
import _ from "underscore";

import Icon from "metabase/components/Icon";

import * as Lib from "metabase-lib";
import { getIconForField } from "metabase-lib/metadata/utils/fields";

import AccordionList from "../AccordionList";

const DEFAULT_MAX_HEIGHT = 610;

function renderColumnName(column: Lib.ColumnDisplayInfo) {
  return column.display_name;
}

function omitColumnDescription() {
  return null;
}

function renderColumnIcon(column: Lib.ColumnDisplayInfo) {
  return <Icon name={getIconForField(column)} size={18} />;
}

function getTableIcon(sampleColumn: Lib.ColumnDisplayInfo) {
  if (sampleColumn.is_from_join) {
    return "join_left_outer";
  }
  if (sampleColumn.is_implicitly_joinable) {
    return "connections";
  }
  return "table";
}

interface QueryColumnPickerProps {
  className?: string;
  query: Lib.Query;
  columns: Lib.ColumnMetadata[];
  maxHeight?: number;
  onSelect: (column: Lib.ColumnMetadata) => void;
  onClose?: () => void;
}

type ColumnListItem = Lib.ColumnDisplayInfo & {
  metadataRef: Lib.ColumnMetadata;
};

function QueryColumnPicker({
  className,
  query,
  columns: columnsMetadata,
  maxHeight = DEFAULT_MAX_HEIGHT,
  onSelect,
  onClose,
}: QueryColumnPickerProps) {
  const columns: ColumnListItem[] = useMemo(
    () =>
      columnsMetadata.map(metadata => {
        const displayInfo = Lib.displayInfo(query, metadata);
        return {
          ...displayInfo,
          metadataRef: metadata,
        };
      }),
    [query, columnsMetadata],
  );

  const sourceTableDisplayName = useMemo(() => {
    const sourceTableColumn = columns.find(
      column =>
        !column.is_calculated &&
        !column.is_from_join &&
        !column.is_implicitly_joinable,
    );
    return sourceTableColumn?.table?.display_name || "";
  }, [columns]);

  const sections = useMemo(() => {
    const { calculatedColumns = [], ...columnsByTable } = _.groupBy(
      columns,
      column => column?.table?.display_name || "calculatedColumns",
    );

    return Object.entries(columnsByTable).map(([tableName, tableColumns]) => {
      const isSourceTable = tableName === sourceTableDisplayName;
      const items = isSourceTable
        ? [...calculatedColumns, ...tableColumns]
        : tableColumns;
      return {
        name: tableName,
        items,
        icon: getTableIcon(items[0]),
      };
    });
  }, [columns, sourceTableDisplayName]);

  const handleSelect = useCallback(
    (column: ColumnListItem) => {
      onSelect(column.metadataRef);
      onClose?.();
    },
    [onSelect, onClose],
  );

  return (
    <AccordionList
      className={className}
      sections={sections}
      maxHeight={maxHeight}
      alwaysExpanded={false}
      onChange={handleSelect}
      renderItemName={renderColumnName}
      renderItemDescription={omitColumnDescription}
      renderItemIcon={renderColumnIcon}
    />
  );
}

export default QueryColumnPicker;
