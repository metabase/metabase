import React, { ChangeEvent, useCallback, useState } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import Tables from "metabase/entities/tables";
import Radio from "metabase/core/components/Radio/Radio";
import { TableId, TableVisibilityType } from "metabase-types/api";
import { State } from "metabase-types/store";
import Table from "metabase-lib/metadata/Table";
import MetadataSchema from "../MetadataSchema";
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
  selectedTableId: TableId;
}

interface TableLoaderProps {
  table: Table;
}

interface DispatchProps {
  onUpdateProperty: (table: Table, name: keyof Table, value: unknown) => void;
}

type MetadataTableProps = OwnProps & TableLoaderProps & DispatchProps;

const mapDispatchToProps: DispatchProps = {
  onUpdateProperty: Tables.actions.updateProperty,
};

const MetadataTable = ({ table, onUpdateProperty }: MetadataTableProps) => {
  const [tab, setTab] = useState<MetadataTabType>("columns");

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

  const handleChangeVisibility = useCallback(
    (visibility: TableVisibilityType) => {
      onUpdateProperty(table, "visibility_type", visibility);
    },
    [table, onUpdateProperty],
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
      {tab === "original_schema" && <MetadataSchema table={table} />}
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

export default _.compose(
  Tables.load({
    id: (_: State, { selectedTableId }: OwnProps) => selectedTableId,
    query: {
      include_sensitive_fields: true,
    },
    requestType: "fetchMetadata",
    selectorName: "getTableUnfiltered",
  }),
  connect(null, mapDispatchToProps),
)(MetadataTable);
