import React, { ChangeEvent, useCallback, useState } from "react";
import { connect } from "react-redux";
import { useAsync } from "react-use";
import { t } from "ttag";
import Databases from "metabase/entities/databases";
import Tables from "metabase/entities/tables";
import Radio from "metabase/core/components/Radio/Radio";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { DatabaseId, TableId, TableVisibilityType } from "metabase-types/api";
import { State } from "metabase-types/store";
import Field from "metabase-lib/metadata/Field";
import Table from "metabase-lib/metadata/Table";
import MetadataTableSchema from "../MetadataTableSchema";
import MetadataTableColumnList from "../MetadataTableColumnList";
import {
  TableDescription,
  TableDescriptionInput,
  TableName,
  TableNameInput,
  VisibilityBadge,
} from "./MetadataTable.styled";

type MetadataTabType = "columns" | "original_schema";

const TABLE_QUERY = {
  include_sensitive_fields: true,
};

const METADATA_TAB_OPTIONS = [
  { name: t`Columns`, value: "columns" },
  { name: t`Original schema`, value: "original_schema" },
];

interface HasDatabaseId {
  id: DatabaseId;
}

interface HasTableId {
  id: TableId;
}

interface HasEntityQuery {
  entityQuery: unknown;
}

interface OwnProps {
  selectedDatabaseId: DatabaseId;
  selectedTableId: TableId;
}

interface StateProps {
  table?: Table;
  idFields?: Field[];
}

interface DispatchProps {
  onFetchForeignTables: (
    table: HasTableId,
    opts: HasEntityQuery,
  ) => Promise<void>;
  onFetchIdFields: (database: HasDatabaseId) => Promise<void>;
  onUpdateTable: (table: Table, name: string, value: unknown) => void;
}

type MetadataTableProps = OwnProps & StateProps & DispatchProps;

const mapStateToProps = (
  state: State,
  { selectedDatabaseId, selectedTableId }: OwnProps,
): StateProps => ({
  table: Tables.selectors.getObjectUnfiltered(state, {
    entityId: selectedTableId,
  }),
  idFields: Databases.selectors.getIdfields(state, {
    databaseId: selectedDatabaseId,
  }),
});

const mapDispatchToProps: DispatchProps = {
  onFetchForeignTables: Tables.actions.fetchMetadataAndForeignTables,
  onFetchIdFields: Databases.objectActions.fetchIdfields,
  onUpdateTable: Tables.actions.updateProperty,
};

const MetadataTable = ({
  table,
  idFields = [],
  selectedDatabaseId,
  selectedTableId,
  onFetchForeignTables,
  onFetchIdFields,
  onUpdateTable,
}: MetadataTableProps) => {
  const { loading, error } = useAsync(() => {
    return Promise.all([
      onFetchForeignTables(
        { id: selectedTableId },
        { entityQuery: TABLE_QUERY },
      ),
      onFetchIdFields({ id: selectedDatabaseId }),
    ]);
  }, [selectedTableId]);

  if (table == null || loading || error != null) {
    return <LoadingAndErrorWrapper loading={loading} error={error} />;
  }

  return (
    <MetadataTableView
      table={table}
      idFields={idFields}
      onUpdateTable={onUpdateTable}
    />
  );
};

interface MetadataTableViewProps {
  table: Table;
  idFields: Field[];
  onUpdateTable: (table: Table, name: string, value: unknown) => void;
}

const MetadataTableView = ({
  table,
  idFields,
  onUpdateTable,
}: MetadataTableViewProps) => {
  const [tab, setTab] = useState<MetadataTabType>("columns");

  const handleChangeName = useCallback(
    (name: string) => {
      onUpdateTable(table, "display_name", name);
    },
    [table, onUpdateTable],
  );

  const handleChangeDescription = useCallback(
    (description: string) => {
      onUpdateTable(table, "description", description);
    },
    [table, onUpdateTable],
  );

  const handleChangeVisibility = useCallback(
    (visibility: TableVisibilityType) => {
      onUpdateTable(table, "visibility_type", visibility);
    },
    [table, onUpdateTable],
  );

  return (
    <div className="MetadataTable full px3">
      <TableTitleSection
        table={table}
        tab={tab}
        onChangeName={handleChangeName}
        onChangeDescription={handleChangeDescription}
      />
      <TableVisibilitySection
        table={table}
        onChangeVisibility={handleChangeVisibility}
      />
      <TableTabSection tab={tab} onChangeTab={setTab} />
      {tab === "original_schema" && <MetadataTableSchema table={table} />}
      {tab === "columns" && (
        <MetadataTableColumnList table={table} idFields={idFields} />
      )}
    </div>
  );
};

interface TableTitleSectionProps {
  table: Table;
  tab: MetadataTabType;
  onChangeName: (name: string) => void;
  onChangeDescription: (description: string) => void;
}

const TableTitleSection = ({
  table,
  tab,
  onChangeName,
  onChangeDescription,
}: TableTitleSectionProps) => {
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
      {tab === "columns" ? (
        <>
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
        </>
      ) : (
        <>
          <TableName>{table.name}</TableName>
          <TableDescription>
            {table.description ?? t`No table description yet`}
          </TableDescription>
        </>
      )}
    </div>
  );
};

interface TableVisibilitySectionProps {
  table: Table;
  onChangeVisibility: (visibility: TableVisibilityType) => void;
}

const TableVisibilitySection = ({
  table,
  onChangeVisibility,
}: TableVisibilitySectionProps) => {
  const handleChangeVisible = useCallback(
    () => onChangeVisibility(null),
    [onChangeVisibility],
  );

  const handleChangeHidden = useCallback(
    () => onChangeVisibility("hidden"),
    [onChangeVisibility],
  );

  const handleChangeTechnical = useCallback(
    () => onChangeVisibility("technical"),
    [onChangeVisibility],
  );

  const handleChangeCruft = useCallback(
    () => onChangeVisibility("cruft"),
    [onChangeVisibility],
  );

  return (
    <div className="MetadataTable-header flex align-center py2 text-medium">
      <span className="mx1 text-uppercase">{t`Visibility`}</span>
      <span id="VisibilityTypes">
        <VisibilityBadge
          isSelected={table.visibility_type === null}
          onClick={handleChangeVisible}
        >
          {t`Queryable`}
        </VisibilityBadge>
        <VisibilityBadge
          isSelected={
            table.visibility_type == null || table.visibility_type === "hidden"
          }
          onClick={handleChangeHidden}
        >
          {t`Hidden`}
        </VisibilityBadge>

        {table.visibility_type && (
          <span id="VisibilitySubTypes" className="border-left mx2">
            <span className="mx2 text-uppercase text-medium">{t`Why Hide?`}</span>
            <VisibilityBadge
              isSelected={table.visibility_type === "technical"}
              onClick={handleChangeTechnical}
            >
              {t`Technical Data`}
            </VisibilityBadge>
            <VisibilityBadge
              isSelected={table.visibility_type === "cruft"}
              onClick={handleChangeCruft}
            >
              {t`Irrelevant/Cruft`}
            </VisibilityBadge>
          </span>
        )}
      </span>
    </div>
  );
};

interface MetadataTabSectionProps {
  tab: MetadataTabType;
  onChangeTab: (tab: MetadataTabType) => void;
}

const TableTabSection = ({ tab, onChangeTab }: MetadataTabSectionProps) => {
  return (
    <div className="mx1 border-bottom">
      <Radio
        colorScheme="default"
        value={tab}
        options={METADATA_TAB_OPTIONS}
        onOptionClick={onChangeTab}
        variant="underlined"
      />
    </div>
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(MetadataTable);
