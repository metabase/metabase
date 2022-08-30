import React, { ChangeEventHandler, useEffect, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import Databases from "metabase/entities/databases";
import Tables from "metabase/entities/tables";
import withTableMetadataLoaded from "metabase/admin/datamodel/hoc/withTableMetadataLoaded";
import Radio from "metabase/core/components/Radio";
import { isSyncCompleted } from "metabase/lib/syncing";
import { DatabaseEntity, TableEntity } from "metabase-types/entities";
import { TableVisibilityType } from "metabase-types/api";
import { State } from "metabase-types/store";

import ColumnsList from "../ColumnsList";
import MetadataSchema from "../MetadataSchema";
import TableSyncWarning from "../TableSyncWarning";
import {
  TableDescription,
  TableDescriptionInput,
  TableName,
  TableNameInput,
  VisibilityType,
} from "./MetadataTable.styled";
import { Field } from "metabase-types/api/field";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";

const getDescriptionPlaceholder = () => t`No table description yet`;

interface MetadataTableProps {
  database?: DatabaseEntity;
  table: TableEntity;
  idfields: Field[];
  updateField: (field: Field) => void;
}

const MetadataTable = ({
  database,
  table,
  idfields,
  updateField,
}: MetadataTableProps) => {
  const [tab, setTab] = useState("columns");
  useEffect(() => {
    database?.fetchIdfields({
      ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [database?.id]);

  const handlePropertyUpdate = (name: string, value: string | null) => {
    table.updateProperty(name, value);
  };

  const handleNameChange: ChangeEventHandler<HTMLInputElement> = event => {
    if (!_.isEmpty(event.target.value)) {
      handlePropertyUpdate("display_name", event.target.value);
    } else {
      // if the user set this to empty then simply reset it because that's not allowed!
      event.target.value = table.display_name;
    }
  };

  const handleDescriptionChange: ChangeEventHandler<
    HTMLInputElement
  > = event => {
    handlePropertyUpdate("description", event.target.value);
  };

  const handleVisibilityTypeChange = (visibilityType: TableVisibilityType) => {
    handlePropertyUpdate("visibility_type", visibilityType);
  };

  const isHidden = !!table.visibility_type;
  const isSynced = isSyncCompleted(table);
  const hasFields = table.fields && table.fields.length > 0;

  if (!table) {
    return null;
  }

  return (
    <div className="MetadataTable full px3">
      <div className="MetadataTable-title flex flex-column">
        {tab === "columns" && (
          <>
            <TableNameInput
              data-testid="table-name"
              name="display_name"
              type="text"
              value={table.display_name || ""}
              onBlurChange={handleNameChange}
            />
            <TableDescriptionInput
              data-testid="table-description"
              name="description"
              type="text"
              value={table.description || ""}
              onBlurChange={handleDescriptionChange}
              placeholder={getDescriptionPlaceholder()}
            />
          </>
        )}
        {tab === "original_schema" && (
          <>
            <TableName>{table.name}</TableName>
            <TableDescription>
              {table.description ?? getDescriptionPlaceholder()}
            </TableDescription>
          </>
        )}
      </div>
      <div className="MetadataTable-header flex align-center py2 text-medium">
        <span className="mx1 text-uppercase">{t`Visibility`}</span>
        <span id="VisibilityTypes">
          <VisibilityType
            isSelected={table.visibility_type === null}
            onClick={() => handlePropertyUpdate("visibility_type", null)}
          >{t`Queryable`}</VisibilityType>
          <VisibilityType
            isSelected={
              table.visibility_type === "hidden" || !!table.visibility_type
            }
            onClick={() => handlePropertyUpdate("visibility_type", "hidden")}
          >{t`Hidden`}</VisibilityType>

          {table.visibility_type && (
            <span id="VisibilitySubTypes" className="border-left mx2">
              <span className="mx2 text-uppercase text-medium">{t`Why Hide?`}</span>
              <VisibilityType
                isSelected={table.visibility_type === "technical"}
                onClick={() =>
                  handlePropertyUpdate("visibility_type", "technical")
                }
              >{t`Technical Data`}</VisibilityType>
              <VisibilityType
                isSelected={table.visibility_type === "cruft"}
                onClick={() => handlePropertyUpdate("visibility_type", "cruft")}
              >{t`Irrelevant/Cruft`}</VisibilityType>
            </span>
          )}
        </span>
      </div>
      <div className="mx1 border-bottom">
        <Radio
          colorScheme="default"
          value={tab}
          options={[
            { name: t`Columns`, value: "columns" },
            { name: t`Original schema`, value: "original_schema" },
          ]}
          onOptionClick={setTab}
          variant="underlined"
        />
      </div>
      {tab === "original_schema" && <MetadataSchema tableId={table.id} />}
      {tab === "columns" && (
        <div className={"mt2 " + (isHidden ? "disabled" : "")}>
          {idfields && (
            <ColumnsList
              table={table}
              updateField={updateField}
              idfields={idfields}
            />
          )}
        </div>
      )}
      {!isSynced && isHidden && !hasFields && (
        <TableSyncWarning onVisibilityTypeChange={handleVisibilityTypeChange} />
      )}
    </div>
  );
};

export default _.compose(
  Databases.load({
    id: (_state: State, { databaseId }: { databaseId: number }) => databaseId,
    query: {
      ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    },
    wrapped: true,
  }),
  Tables.load({
    id: (_state: State, { tableId }: { tableId: number }) => tableId,
    query: {
      ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    },
    wrapped: true,
    selectorName: "getObjectUnfiltered",
  }),
  withTableMetadataLoaded,
)(MetadataTable);
