import cx from "classnames";
import type { ChangeEvent, MouseEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { useAsyncFn } from "react-use";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import Tooltip from "metabase/core/components/Tooltip";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import Tables from "metabase/entities/tables";
import { isSyncCompleted, isSyncInProgress } from "metabase/lib/syncing";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { Icon } from "metabase/ui";
import type Table from "metabase-lib/v1/metadata/Table";
import { getSchemaName } from "metabase-lib/v1/metadata/utils/schema";
import type {
  DatabaseId,
  SchemaId,
  TableId,
  TableVisibilityType,
} from "metabase-types/api";
import type { Dispatch, State } from "metabase-types/store";

import {
  AdminListItem,
  BackIconContainer,
  HideIconButton,
} from "./MetadataTableList.styled";

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
  ) => Promise<unknown>;
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
    <aside
      data-testid="admin-metadata-table-list"
      className={cx(CS.flexNoShrink, AdminS.AdminList)}
    >
      <TableSearch searchText={searchText} onChangeSearchText={setSearchText} />
      {canGoBack && (
        <TableBreadcrumbs
          schemaId={selectedSchemaId}
          onBack={handleSelectDatabase}
        />
      )}
      <ul>
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
    </aside>
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
    <div className={AdminS.AdminListSearch}>
      <Icon className={AdminS.Icon} name="search" size={16} />
      <input
        className={cx(AdminS.AdminInput, CS.pl4, CS.borderBottom)}
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
    <h4 className={cx(CS.p2, CS.borderBottom, CS.breakAnywhere)}>
      <BackIconContainer onClick={onBack}>
        <Icon name="chevronleft" size={10} />
        {t`Schemas`}
      </BackIconContainer>
      <span className={CS.mx1}>/</span>
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
  ) => Promise<unknown>;
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
    <div
      className={cx(
        CS.flex,
        CS.justifyBetween,
        CS.alignCenter,
        AdminS.AdminListSection,
      )}
    >
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
  return <div className={AdminS.AdminListSection}>{t`0 Tables`}</div>;
};

interface TableRowProps {
  table: Table;
  isSelected: boolean;
  onSelectTable: (tableId: TableId) => void;
  onUpdateTableVisibility: (
    tables: Table[],
    visibility: TableVisibilityType,
  ) => Promise<unknown>;
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
    <li className={cx(CS.hoverParent, CS.hoverVisibility)}>
      <AdminListItem
        disabled={!isSyncCompleted(table)}
        onClick={handleSelect}
        data-testid="admin-metadata-table-list-item"
        className={cx(
          CS.textWrap,
          CS.justifyBetween,
          CS.flex,
          CS.alignCenter,
          CS.noDecoration,
          AdminS.AdminListItem,
          { [AdminS.selected]: isSelected },
        )}
      >
        {table.displayName()}
        {isSyncCompleted(table) && (
          <div className={cx(CS.hoverChild, CS.floatRight)}>
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
  ) => Promise<unknown>;
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
      <HideIconButton
        disabled={loading}
        aria-label={tooltip}
        onClick={handleClick}
      >
        <Icon name={isHidden ? "eye" : "eye_crossed_out"} size={18} />
      </HideIconButton>
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
