import React, { useCallback, useMemo } from "react";

import AccordionList from "metabase/core/components/AccordionList";
import Icon from "metabase/components/Icon";
import { singularize } from "metabase/lib/formatting";

import * as Lib from "metabase-lib";
import { getIconForField } from "metabase-lib/metadata/utils/fields";

const DEFAULT_MAX_HEIGHT = 610;

interface QueryColumnPickerProps {
  className?: string;
  query: Lib.Query;
  columnGroups: Lib.ColumnGroup[];
  maxHeight?: number;
  onSelect: (column: Lib.ColumnMetadata) => void;
  onClose?: () => void;
}

type ColumnListItem = Lib.ColumnDisplayInfo & {
  column: Lib.ColumnMetadata;
};

type Sections = {
  name: string;
  items: ColumnListItem[];
  icon?: string;
};

function QueryColumnPicker({
  className,
  query,
  columnGroups,
  maxHeight = DEFAULT_MAX_HEIGHT,
  onSelect,
  onClose,
}: QueryColumnPickerProps) {
  const sections: Sections[] = useMemo(
    () =>
      columnGroups.map(group => {
        const groupInfo = Lib.displayInfo(query, group);

        const items = Lib.getColumnsFromColumnGroup(group).map(column => {
          const displayInfo = Lib.displayInfo(query, column);
          return {
            ...displayInfo,
            column,
          };
        });

        return {
          name: getGroupName(groupInfo),
          icon: getGroupIcon(groupInfo),
          items,
        };
      }),
    [query, columnGroups],
  );

  const handleSelect = useCallback(
    (item: ColumnListItem) => {
      onSelect(item.column);
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
      renderItemName={renderItemName}
      renderItemDescription={omitItemDescription}
      renderItemIcon={renderItemIcon}
    />
  );
}

function renderItemName(item: ColumnListItem) {
  return item.display_name;
}

function omitItemDescription() {
  return null;
}

function renderItemIcon(item: ColumnListItem) {
  return <Icon name={getIconForField(item)} size={18} />;
}

function getGroupName(groupInfo: Lib.ColumnDisplayInfo | Lib.TableDisplayInfo) {
  const columnInfo = groupInfo as Lib.ColumnDisplayInfo;
  const tableInfo = groupInfo as Lib.TableDisplayInfo;
  return columnInfo.fk_reference_name || singularize(tableInfo.display_name);
}

function getGroupIcon(groupInfo: Lib.ColumnDisplayInfo | Lib.TableDisplayInfo) {
  if ((groupInfo as Lib.TableDisplayInfo).is_source_table) {
    return "table";
  }
  if (groupInfo.is_from_join) {
    return "join_left_outer";
  }
  if (groupInfo.is_implicitly_joinable) {
    return "connections";
  }
  return;
}

export default QueryColumnPicker;
