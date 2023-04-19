import React, {
  ChangeEvent,
  MouseEvent,
  useCallback,
  useMemo,
  useState,
} from "react";
import { useAsyncFn } from "react-use";
import cx from "classnames";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";
import { useDispatch } from "metabase/lib/redux";
import Tables from "metabase/entities/tables";
import Icon from "metabase/components/Icon/Icon";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import Tooltip from "metabase/core/components/Tooltip";
import {
  DatabaseId,
  Schema,
  Table,
  TableVisibilityType,
} from "metabase-types/api";
import { State } from "metabase-types/store";

interface OwnProps {
  selectedDatabaseId: DatabaseId;
  selectedSchema: Schema;
  selectedTable?: Table;
  onSelectTable: (table: Table) => void;
  onBack?: () => void;
}

interface TableLoaderProps {
  tables: Table[];
}

type TableListProps = OwnProps & TableLoaderProps;

const TableList = ({
  selectedSchema,
  selectedTable,
  tables: allTables,
  onSelectTable,
  onBack,
}: TableListProps) => {
  const [searchText, setSearchText] = useState("");
  const dispatch = useDispatch();

  const [hiddenTables, visibleTables] = useMemo(() => {
    const searchValue = searchText.toLowerCase();

    return _.chain(allTables)
      .filter(table => table.display_name.toLowerCase().includes(searchValue))
      .sortBy(table => table.display_name)
      .partition(table => table.visibility_type != null)
      .value();
  }, [allTables, searchText]);

  const handleUpdateVisibility = useCallback(
    async (tables: Table[], visibility: TableVisibilityType) => {
      const payload = {
        ids: tables.map(({ id }) => id),
        visibility_type: visibility,
      };

      await dispatch(Tables.actions.bulkUpdate(payload));
    },
    [dispatch],
  );

  return (
    <div className="MetadataEditor-table-list AdminList flex-no-shrink">
      <TableSearch searchText={searchText} onChangeSearchText={setSearchText} />
      {onBack && <TableBreadcrumbs schema={selectedSchema} onBack={onBack} />}
      <ul className="AdminList-items">
        {visibleTables.length > 0 && (
          <TableHeader
            tables={visibleTables}
            isHidden={false}
            onUpdateTableVisibility={handleUpdateVisibility}
          />
        )}
        {visibleTables.map(table => (
          <TableRow
            key={table.id}
            table={table}
            isSelected={table.id === selectedTable?.id}
            onSelectTable={onSelectTable}
            onUpdateTableVisibility={handleUpdateVisibility}
          />
        ))}
        {hiddenTables.length > 0 && (
          <TableHeader
            tables={hiddenTables}
            isHidden={true}
            onUpdateTableVisibility={handleUpdateVisibility}
          />
        )}
        {hiddenTables.map(table => (
          <TableRow
            key={table.id}
            table={table}
            isSelected={table.id === selectedTable?.id}
            onSelectTable={onSelectTable}
            onUpdateTableVisibility={handleUpdateVisibility}
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
  schema: Schema;
  onBack: () => void;
}

const TableBreadcrumbs = ({ schema, onBack }: TableBreadcrumbsProps) => {
  return (
    <h4 className="p2 border-bottom break-anywhere">
      <span className="text-brand cursor-pointer" onClick={onBack}>
        <Icon name="chevronleft" size={10} />
        {t`Schemas`}
      </span>
      <span className="mx1">-</span>
      <span> {schema.name}</span>
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
        msgid`${tables.length} Queryable Table`,
        `${tables.length} Queryable Tables`,
        tables.length,
      )
    : ngettext(
        msgid`${tables.length} Queryable Table`,
        `${tables.length} Queryable Tables`,
        tables.length,
      );

  return (
    <li className="AdminList-section flex justify-between align-center">
      {title}
      <ToggleVisibilityButton
        tables={tables}
        isHidden={isHidden}
        onUpdateTableVisibility={onUpdateTableVisibility}
      />
    </li>
  );
};

const TableEmptyState = () => {
  return <li className="AdminList-section">{t`0 Tables`}</li>;
};

interface TableRowProps {
  table: Table;
  isSelected: boolean;
  onSelectTable: (table: Table) => void;
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
    onSelectTable(table);
  }, [table, onSelectTable]);

  return (
    <li className="hover-parent hover--visibility">
      <a
        className={cx(
          "AdminList-item flex align-center no-decoration text-wrap justify-between",
          { selected: isSelected },
        )}
        onClick={handleSelect}
      >
        {table.display_name}
        <div className="hover-child float-right">
          <ToggleVisibilityButton
            tables={tables}
            isHidden={table.visibility_type != null}
            onUpdateTableVisibility={onUpdateTableVisibility}
          />
        </div>
      </a>
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
  const [{ loading }, handleUpdate] = useAsyncFn(onUpdateTableVisibility);

  const handleClick = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      handleUpdate(tables, isHidden ? null : "hidden");
    },
    [tables, isHidden, handleUpdate],
  );

  return (
    <Tooltip tooltip={getToggleTooltip(isHidden, hasMultipleTables)}>
      <IconButtonWrapper
        className={cx(
          "float-right",
          loading ? "cursor-not-allowed" : "brand-hover",
        )}
        disabled={loading}
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

export default Tables.loadList({
  query: (_: State, { selectedDatabaseId, selectedSchema }: OwnProps) => ({
    dbId: selectedDatabaseId,
    schemaName: selectedSchema,
  }),
  selectorName: "getListUnfiltered",
})(TableList);
