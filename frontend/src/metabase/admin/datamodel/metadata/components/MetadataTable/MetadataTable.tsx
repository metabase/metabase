import { ChangeEvent, ReactNode, useCallback, useState } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import Databases from "metabase/entities/databases";
import Tables from "metabase/entities/tables";
import Radio from "metabase/core/components/Radio/Radio";
import {
  DatabaseId,
  SchemaId,
  TableId,
  TableVisibilityType,
} from "metabase-types/api";
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

const METADATA_TAB_OPTIONS = [
  { name: t`Columns`, value: "columns" },
  { name: t`Original schema`, value: "original_schema" },
];

interface OwnProps {
  selectedDatabaseId: DatabaseId;
  selectedSchemaId: SchemaId;
  selectedTableId: TableId;
}

interface TableLoaderProps {
  table: Table;
}

interface StateProps {
  idFields: Field[];
}

interface DispatchProps {
  onUpdateTable: (table: Table, name: string, value: unknown) => void;
}

type MetadataTableProps = OwnProps &
  TableLoaderProps &
  StateProps &
  DispatchProps;

const mapStateToProps = (
  state: State,
  { table }: TableLoaderProps,
): StateProps => ({
  idFields: Databases.selectors.getIdFields(state, { databaseId: table.db_id }),
});

const mapDispatchToProps: DispatchProps = {
  onUpdateTable: Tables.actions.updateProperty,
};

const MetadataTable = ({
  table,
  idFields,
  selectedSchemaId,
  onUpdateTable,
}: MetadataTableProps) => {
  const [tab, setTab] = useState<MetadataTabType>("columns");

  const handleChangeName = useCallback(
    (name: string) => {
      onUpdateTable(table, "display_name", name);
    },
    [table, onUpdateTable],
  );

  const handleChangeDescription = useCallback(
    (description: string | null) => {
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
        <MetadataTableColumnList
          table={table}
          idFields={idFields}
          selectedSchemaId={selectedSchemaId}
        />
      )}
    </div>
  );
};

interface TableTitleSectionProps {
  table: Table;
  tab: MetadataTabType;
  onChangeName: (name: string) => void;
  onChangeDescription: (description: string | null) => void;
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
        event.target.value = table.displayName();
      }
    },
    [table, onChangeName],
  );

  const handleDescriptionChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.value) {
        onChangeDescription(event.target.value);
      } else {
        onChangeDescription(null);
      }
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
        <MetadataVisibilityBadge
          isChecked={table.visibility_type == null}
          onClick={handleChangeVisible}
        >
          {t`Queryable`}
        </MetadataVisibilityBadge>
        <MetadataVisibilityBadge
          isChecked={
            table.visibility_type != null || table.visibility_type === "hidden"
          }
          onClick={handleChangeHidden}
        >
          {t`Hidden`}
        </MetadataVisibilityBadge>

        {table.visibility_type && (
          <span id="VisibilitySubTypes" className="border-left mx2">
            <span className="mx2 text-uppercase text-medium">{t`Why Hide?`}</span>
            <MetadataVisibilityBadge
              isChecked={table.visibility_type === "technical"}
              onClick={handleChangeTechnical}
            >
              {t`Technical Data`}
            </MetadataVisibilityBadge>
            <MetadataVisibilityBadge
              isChecked={table.visibility_type === "cruft"}
              onClick={handleChangeCruft}
            >
              {t`Irrelevant/Cruft`}
            </MetadataVisibilityBadge>
          </span>
        )}
      </span>
    </div>
  );
};

interface MetadataVisibilityBadgeProps {
  isChecked: boolean;
  children?: ReactNode;
  onClick?: () => void;
}

const MetadataVisibilityBadge = ({
  isChecked,
  children,
  onClick,
}: MetadataVisibilityBadgeProps) => {
  return (
    <VisibilityBadge
      isChecked={isChecked}
      role="checkbox"
      aria-checked={isChecked}
      onClick={onClick}
    >
      {children}
    </VisibilityBadge>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Databases.load({
    id: (_: State, { selectedDatabaseId }: OwnProps) => selectedDatabaseId,
    query: PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    fetchType: "fetchIdFields",
    requestType: "idFields",
  }),
  Tables.load({
    id: (state: State, { selectedTableId }: OwnProps) => selectedTableId,
    query: {
      include_sensitive_fields: true,
      ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    },
    fetchType: "fetchMetadata",
    requestType: "fetchMetadata",
    selectorName: "getObjectUnfiltered",
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(MetadataTable);
