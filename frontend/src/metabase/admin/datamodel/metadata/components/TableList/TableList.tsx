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
import Icon from "metabase/components/Icon/Icon";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import Tooltip from "metabase/core/components/Tooltip";
import { Schema, Table, TableVisibilityType } from "metabase-types/api";

interface OwnProps {
  selectedSchema: Schema;
  selectedTable?: Table;
  onSelectTable: (table: Table) => void;
  onBack?: () => void;
}

interface TableLoaderProps {
  tables: Table[];
}

interface DispatchProps {
  onUpdateTableVisibility: (
    tables: Table[],
    visibility: TableVisibilityType,
  ) => Promise<void>;
}

type TableListProps = OwnProps & TableLoaderProps & DispatchProps;

const TableList = ({
  selectedSchema,
  selectedTable,
  tables,
  onSelectTable,
  onUpdateTableVisibility,
  onBack,
}: TableListProps) => {
  const [searchText, setSearchText] = useState("");

  return (
    <div className="MetadataEditor-table-list AdminList flex-no-shrink">
      <TableSearch searchText={searchText} onChangeSearchText={setSearchText} />
      {onBack && <TableBreadcrumbs schema={selectedSchema} onBack={onBack} />}
      <ul className="AdminList-items">
        <TableEmptyState />
        <TableHeader
          tables={tables}
          isHidden={false}
          onUpdateTableVisibility={onUpdateTableVisibility}
        />
        {tables.map(table => (
          <TableRow
            key={table.id}
            table={table}
            isSelected={table.id === selectedTable?.id}
            onSelectTable={onSelectTable}
            onUpdateTableVisibility={onUpdateTableVisibility}
          />
        ))}
        <TableHeader
          tables={tables}
          isHidden={true}
          onUpdateTableVisibility={onUpdateTableVisibility}
        />
        {tables.map(table => (
          <TableRow
            key={table.id}
            table={table}
            isSelected={table.id === selectedTable?.id}
            onSelectTable={onSelectTable}
            onUpdateTableVisibility={onUpdateTableVisibility}
          />
        ))}
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

export default TableList;
