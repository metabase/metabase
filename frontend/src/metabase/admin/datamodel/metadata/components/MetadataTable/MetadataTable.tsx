import React, { ChangeEvent, useCallback, useState } from "react";
import { t } from "ttag";
import Table from "metabase-lib/metadata/Table";
import {
  TableDescription,
  TableDescriptionInput,
  TableName,
  TableNameInput,
} from "./MetadataTable.styled";

type MetadataTabType = "metadata" | "schema";

interface TableLoaderProps {
  table: Table;
}

interface DispatchProps {
  onUpdateProperty: (table: Table, name: keyof Table, value: unknown) => void;
}

type MetadataTableProps = TableLoaderProps & DispatchProps;

const MetadataTable = ({ table, onUpdateProperty }: MetadataTableProps) => {
  const [tab] = useState<MetadataTabType>("metadata");

  const handleChangeName = useCallback(
    (name: string) => {
      onUpdateProperty(table, "display_name", name);
    },
    [table, onUpdateProperty],
  );

  const handleChangeDescription = useCallback(
    (description: string) => {
      onUpdateProperty(table, "description", description);
    },
    [table, onUpdateProperty],
  );

  return (
    <div className="MetadataTable full px3">
      {tab === "metadata" ? (
        <TableMetadataTitle
          table={table}
          onChangeName={handleChangeName}
          onChangeDescription={handleChangeDescription}
        />
      ) : (
        <TableSchemaTitle table={table} />
      )}
    </div>
  );
};

interface TableMetadataTitleProps {
  table: Table;
  onChangeName: (name: string) => void;
  onChangeDescription: (description: string) => void;
}

const TableMetadataTitle = ({
  table,
  onChangeName,
  onChangeDescription,
}: TableMetadataTitleProps) => {
  const handleNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.value) {
        onChangeName(event.target.value);
      } else {
        event.target.value = "";
      }
    },
    [onChangeName],
  );

  const handleDescriptionChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChangeDescription(event.target.value);
    },
    [onChangeDescription],
  );

  return (
    <div className="MetadataTable-title flex flex-column">
      <TableNameInput
        name="display_name"
        type="text"
        value={table.displayName() ?? ""}
        data-testid="table-name"
        onBlurChange={handleNameChange}
      />
      <TableDescriptionInput
        name="description"
        type="text"
        value={table.description ?? ""}
        placeholder={t`No table description yet`}
        data-testid="table-description"
        onBlurChange={handleDescriptionChange}
      />
    </div>
  );
};

interface TableSchemaTitleProps {
  table: Table;
}

const TableSchemaTitle = ({ table }: TableSchemaTitleProps) => {
  return (
    <div className="MetadataTable-title flex flex-column">
      <TableName>{table.name}</TableName>
      <TableDescription>
        {table.description ?? t`No table description yet`}
      </TableDescription>
    </div>
  );
};

export default MetadataTable;
