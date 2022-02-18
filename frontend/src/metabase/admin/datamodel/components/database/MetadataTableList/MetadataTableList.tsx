import React, { ChangeEventHandler, useState } from "react";
import { connect } from "react-redux";
import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";

import Tables from "metabase/entities/tables";

import Icon from "metabase/components/Icon";

import { t, ngettext, msgid } from "ttag";

import _ from "underscore";

import { regexpEscape } from "metabase/lib/string";
import { ToggleVisibilityButton } from "./ToggleVisibilityButton";
import { TableRow } from "./TableRow";
import { Table } from "metabase-types/types/Table";

interface MetadataTableListProps {
  onBack?: () => void;
  schema?: string;
  setVisibilityForTables: (tables: Table[]) => void;
  tables: Table[];
  tableId: number;
  selectTable: (table: Table) => void;
}

const MetadataTableList = ({
  onBack,
  schema,
  tables,
  tableId,
  selectTable,
  setVisibilityForTables,
}: MetadataTableListProps) => {
  const [search, setSearch] = useState<{ text: string; regex: RegExp | null }>({
    text: "",
    regex: null,
  });

  const handleSearchChange: ChangeEventHandler<HTMLInputElement> = event => {
    setSearch({
      text: event.target.value,
      regex: event.target.value
        ? new RegExp(regexpEscape(event.target.value), "i")
        : null,
    });
  };

  let queryableTablesHeader, hiddenTablesHeader;

  const regex = search.regex;

  const [hiddenTables, queryableTables] = _.chain(tables)
    .filter(
      table =>
        !regex || regex.test(table.display_name) || regex.test(table.name),
    )
    .sortBy("display_name")
    .partition(table => table.visibility_type != null)
    .value();

  if (queryableTables.length > 0) {
    const editableQueryableTables = queryableTables.filter(table =>
      PLUGIN_ADVANCED_PERMISSIONS.canEditEntityDataModel(table),
    );

    queryableTablesHeader = (
      <li className="AdminList-section flex justify-between align-center">
        {(n =>
          ngettext(msgid`${n} Queryable Table`, `${n} Queryable Tables`, n))(
          queryableTables.length,
        )}
        {editableQueryableTables.length > 0 && (
          <ToggleVisibilityButton
            setVisibilityForTables={setVisibilityForTables}
            tables={editableQueryableTables}
            isHidden={false}
          />
        )}
      </li>
    );
  }
  if (hiddenTables.length > 0) {
    const editableHiddenTables = tables.filter(table =>
      PLUGIN_ADVANCED_PERMISSIONS.canEditEntityDataModel(table),
    );

    hiddenTablesHeader = (
      <li className="AdminList-section">
        {(n => ngettext(msgid`${n} Hidden Table`, `${n} Hidden Tables`, n))(
          hiddenTables.length,
        )}
        {editableHiddenTables.length > 0 && (
          <ToggleVisibilityButton
            setVisibilityForTables={setVisibilityForTables}
            tables={editableHiddenTables}
            isHidden={true}
          />
        )}
      </li>
    );
  }
  if (queryableTables.length === 0 && hiddenTables.length === 0) {
    queryableTablesHeader = <li className="AdminList-section">0 Tables</li>;
  }

  return (
    <div className="MetadataEditor-table-list AdminList flex-no-shrink">
      <div className="AdminList-search">
        <Icon name="search" size={16} />
        <input
          className="AdminInput pl4 border-bottom"
          type="text"
          placeholder={t`Find a table`}
          value={search.text}
          onChange={handleSearchChange}
        />
      </div>
      {(onBack || schema) && (
        <h4 className="p2 border-bottom break-anywhere">
          {onBack && (
            <span className="text-brand cursor-pointer" onClick={onBack}>
              <Icon name="chevronleft" size={10} />
              {t`Schemas`}
            </span>
          )}
          {onBack && schema && <span className="mx1">-</span>}
          {schema && <span> {schema}</span>}
        </h4>
      )}
      <ul className="AdminList-items">
        {queryableTablesHeader}
        {queryableTables.map(table => (
          <TableRow
            key={table.id}
            table={table}
            selected={tableId === table.id}
            selectTable={selectTable}
            setVisibilityForTables={setVisibilityForTables}
          />
        ))}
        {hiddenTablesHeader}
        {hiddenTables.map(table => (
          <TableRow
            key={table.id}
            table={table}
            selected={tableId === table.id}
            selectTable={selectTable}
            setVisibilityForTables={setVisibilityForTables}
          />
        ))}
      </ul>
    </div>
  );
};

export default connect(null, {
  setVisibilityForTables: (
    tables: Table[],
    visibility_type: Table["visibility_type"],
  ) =>
    Tables.actions.bulkUpdate({
      ids: tables.map(t => t.id),
      visibility_type,
    }),
})(MetadataTableList);
