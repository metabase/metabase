import { ChangeEvent, MouseEvent, useCallback, useMemo, useState } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { useAsyncFn } from "react-use";
import cx from "classnames";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import * as Urls from "metabase/lib/urls";
import Tables from "metabase/entities/tables";
import { Icon } from "metabase/core/components/Icon";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import Tooltip from "metabase/core/components/Tooltip";
import {
  DatabaseId,
  SchemaId,
  TableId,
  TableVisibilityType,
} from "metabase-types/api";
import { Dispatch, State } from "metabase-types/store";
import { isSyncCompleted, isSyncInProgress } from "metabase/lib/syncing";
import Table from "metabase-lib/metadata/Table";
import { getSchemaName } from "metabase-lib/metadata/utils/schema";
import { AdminListItem } from "./MetadataTableList.styled";

const RELOAD_INTERVAL = 2000;

interface OwnProps {
  selectedDatabaseId: DatabaseId;
  selectedSchemaId: SchemaId;
  selectedTableId?: TableId;
  canGoBack: boolean;
}

interface TableLoaderProps {
  tables: Table[];
}

interface DispatchProps {
  onSelectDatabase: (databaseId: DatabaseId) => void;
  onSelectTable: (
    databaseId: DatabaseId,
    schemaId: SchemaId,
    tableId: TableId,
  ) => void;
  onUpdateTableVisibility: (
    tables: Table[],
    visibility: TableVisibilityType,
  ) => Promise<void>;
}

type MetadataTableListProps = OwnProps & TableLoaderProps & DispatchProps;

const mapDispatchToProps = (dispatch: Dispatch): DispatchProps => ({
  onSelectDatabase: databaseId =>
    dispatch(push(Urls.dataModelDatabase(databaseId))),
  onSelectTable: (databaseId, schemaId, tableId) =>
    dispatch(push(Urls.dataModelTable(databaseId, schemaId, tableId))),
  onUpdateTableVisibility: async (tables, visibility) =>
    dispatch(
      Tables.actions.bulkUpdate({
        ids: tables.map(table => table.id),
        visibility_type: visibility,
      }),
    ),
});

const MetadataTableList = ({
  tables: allTables,
  selectedDatabaseId,
  selectedSchemaId,
  selectedTableId,
  canGoBack,
  onSelectDatabase,
  onSelectTable,
  onUpdateTableVisibility,
}: MetadataTableListProps) => {
  const [searchText, setSearchText] = useState("");

  const [hiddenTables, visibleTables] = useMemo(() => {
    const searchValue = searchText.toLowerCase();

    return _.chain(allTables)
      .filter(table => table.displayName().toLowerCase().includes(searchValue))
      .sortBy(table => table.displayName())
      .partition(table => table.visibility_type != null)
      .value();
  }, [allTables, searchText]);

  const handleSelectTable = useCallback(
    (tableId: TableId) => {
      onSelectTable(selectedDatabaseId, selectedSchemaId, tableId);
    },
    [selectedDatabaseId, selectedSchemaId, onSelectTable],
  );

  const handleSelectDatabase = useCallback(() => {
    onSelectDatabase(selectedDatabaseId);
  }, [selectedDatabaseId, onSelectDatabase]);

  return (
    <div className="MetadataEditor-table-list AdminList flex-no-shrink">
      <TableSearch searchText={searchText} onChangeSearchText={setSearchText} />
      {canGoBack && (
        <TableBreadcrumbs
          schemaId={selectedSchemaId}
          onBack={handleSelectDatabase}
        />
      )}
      <ul className="AdminList-items">
        {visibleTables.length > 0 && (
          <TableHeader
            tables={visibleTables}
            isHidden={false}
            onUpdateTableVisibility={onUpdateTableVisibility}
          />
        )}
        {visibleTables.map(table => (
          <TableRow
            key={table.id}
            table={table}
            isSelected={table.id === selectedTableId}
            onSelectTable={handleSelectTable}
            onUpdateTableVisibility={onUpdateTableVisibility}
          />
        ))}
        {hiddenTables.length > 0 && (
          <TableHeader
            tables={hiddenTables}
            isHidden={true}
            onUpdateTableVisibility={onUpdateTableVisibility}
          />
        )}
        {hiddenTables.map(table => (
          <TableRow
            key={table.id}
            table={table}
            isSelected={table.id === selectedTableId}
            onSelectTable={handleSelectTable}
            onUpdateTableVisibility={onUpdateTableVisibility}
          />
        ))}
        {visibleTables.length === 0 && hiddenTables.length === 0 && (
          <TableEmptyState />
        )}
      </ul>
    </div>
  );
};

interface TableSearchProps {
  searchText: string;
  onChangeSearchText: (searchText: string) => void;
}

const TableSearch = ({ searchText, onChangeSearchText }: TableSearchProps) => {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChangeSearchText(event.target.value);
    },
    [onChangeSearchText],
  );

  return (
    <div className="AdminList-search">
      <Icon name="search" size={16} />
      <input
        className="AdminInput pl4 border-bottom"
        type="text"
        placeholder={t`Find a table`}
        value={searchText}
        onChange={handleChange}
      />
    </div>
  );
};

interface TableBreadcrumbsProps {
  schemaId: string;
  onBack: () => void;
}

const TableBreadcrumbs = ({ schemaId, onBack }: TableBreadcrumbsProps) => {
  return (
    <h4 className="p2 border-bottom break-anywhere">
      <span className="text-brand cursor-pointer" onClick={onBack}>
        <Icon name="chevronleft" size={10} />
        {t`Schemas`}
      </span>
      <span className="mx1">-</span>
      <span>{getSchemaName(schemaId)}</span>
    </h4>
  );
};

interface TableHeaderProps {
  tables: Table[];
  isHidden: boolean;
  onUpdateTableVisibility: (
    tables: Table[],
    visibility: TableVisibilityType,
  ) => Promise<void>;
}

const TableHeader = ({
  tables,
  isHidden,
  onUpdateTableVisibility,
}: TableHeaderProps) => {
  const title = isHidden
    ? ngettext(
        msgid`${tables.length} Hidden Table`,
        `${tables.length} Hidden Tables`,
        tables.length,
      )
    : ngettext(
        msgid`${tables.length} Queryable Table`,
        `${tables.length} Queryable Tables`,
        tables.length,
      );

  return (
    <div className="AdminList-section flex justify-between align-center">
      {title}
      <ToggleVisibilityButton
        tables={tables}
        isHidden={isHidden}
        onUpdateTableVisibility={onUpdateTableVisibility}
      />
    </div>
  );
};

const TableEmptyState = () => {
  return <div className="AdminList-section">{t`0 Tables`}</div>;
};

interface TableRowProps {
  table: Table;
  isSelected: boolean;
  onSelectTable: (tableId: TableId) => void;
  onUpdateTableVisibility: (
    tables: Table[],
    visibility: TableVisibilityType,
  ) => Promise<void>;
}

const TableRow = ({
  table,
  isSelected,
  onSelectTable,
  onUpdateTableVisibility,
}: TableRowProps) => {
  const tables = useMemo(() => {
    return [table];
  }, [table]);

  const handleSelect = useCallback(() => {
    onSelectTable(table.id);
  }, [table, onSelectTable]);

  return (
    <li className="hover-parent hover--visibility">
      <AdminListItem
        disabled={!isSyncCompleted(table)}
        onClick={handleSelect}
        className={cx(
          "AdminList-item flex align-center no-decoration text-wrap justify-between",
          { selected: isSelected },
        )}
      >
        {table.displayName()}
        {isSyncCompleted(table) && (
          <div className="hover-child float-right">
            <ToggleVisibilityButton
              tables={tables}
              isHidden={table.visibility_type != null}
              onUpdateTableVisibility={onUpdateTableVisibility}
            />
          </div>
        )}
      </AdminListItem>
    </li>
  );
};

interface ToggleVisibilityButtonProps {
  tables: Table[];
  isHidden: boolean;
  onUpdateTableVisibility: (
    tables: Table[],
    visibility: TableVisibilityType,
  ) => Promise<void>;
}

const ToggleVisibilityButton = ({
  tables,
  isHidden,
  onUpdateTableVisibility,
}: ToggleVisibilityButtonProps) => {
  const hasMultipleTables = tables.length > 1;
  const tooltip = getToggleTooltip(isHidden, hasMultipleTables);
  const [{ loading }, handleUpdate] = useAsyncFn(onUpdateTableVisibility);

  const handleClick = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      handleUpdate(tables, isHidden ? null : "hidden");
    },
    [tables, isHidden, handleUpdate],
  );

  return (
    <Tooltip tooltip={tooltip}>
      <IconButtonWrapper
        className={cx(
          "float-right",
          loading ? "cursor-not-allowed" : "text-brand-hover",
        )}
        disabled={loading}
        aria-label={tooltip}
        onClick={handleClick}
      >
        <Icon name={isHidden ? "eye" : "eye_crossed_out"} size={18} />
      </IconButtonWrapper>
    </Tooltip>
  );
};

const getToggleTooltip = (isHidden: boolean, hasMultipleTables?: boolean) => {
  if (hasMultipleTables) {
    return isHidden ? t`Unhide all` : t`Hide all`;
  } else {
    return isHidden ? t`Unhide` : t`Hide`;
  }
};

const getReloadInterval = (
  _state: State,
  _props: TableLoaderProps,
  tables = [],
) => {
  return tables.some(t => isSyncInProgress(t)) ? RELOAD_INTERVAL : 0;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Tables.loadList({
    query: (_: State, { selectedDatabaseId, selectedSchemaId }: OwnProps) => ({
      dbId: selectedDatabaseId,
      schemaName: getSchemaName(selectedSchemaId),
      include_hidden: true,
      ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    }),
    selectorName: "getListUnfiltered",
    reloadInterval: getReloadInterval,
  }),
  connect(null, mapDispatchToProps),
)(MetadataTableList);
