import React from "react";
import { useAsync } from "react-use";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import * as Urls from "metabase/lib/urls";
import Databases from "metabase/entities/databases";
import Schemas from "metabase/entities/schemas";
import Tables from "metabase/entities/tables";
import Fields from "metabase/entities/fields";
import AdminLayout from "metabase/components/AdminLayout";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { LeftNavPane, LeftNavPaneItem } from "metabase/components/LeftNavPane";
import { DatabaseId, FieldId, Schema } from "metabase-types/api";
import { State } from "metabase-types/store";
import Database from "metabase-lib/metadata/Database";
import Table from "metabase-lib/metadata/Table";
import Field from "metabase-lib/metadata/Field";
import { discardFieldValues, rescanFieldValues } from "../../actions";
import MetadataBackButton from "../MetadataBackButton";
import MetadataFieldGeneralSettings from "../MetadataFieldGeneralSettings";

interface HasDatabaseId {
  id: DatabaseId;
}

interface RouterParams {
  databaseId: string;
  schemaId: string;
  tableId: string;
  fieldId: string;
  section: FieldSectionType;
}

interface RouterProps {
  params: RouterParams;
}

type FieldSectionType = "general" | "formatting";

interface DatabaseLoaderProps {
  database: Database;
}

interface SchemaLoaderProps {
  schemas: Schema[];
}

interface TableLoaderProps {
  table: Table;
}

interface FieldLoaderProps {
  field: Field;
}

interface StateProps {
  idFields: Field[] | undefined;
}

interface DispatchProps {
  onFetchIdFields: (database: HasDatabaseId, params: unknown) => void;
  onUpdateField: (field: Field, updates: Partial<Field>) => void;
  onRescanFieldValues: (fieldId: FieldId) => void;
  onDiscardFieldValues: (fieldId: FieldId) => void;
}

type MetadataFieldSettingsProps = RouterProps &
  DatabaseLoaderProps &
  SchemaLoaderProps &
  TableLoaderProps &
  FieldLoaderProps &
  StateProps &
  DispatchProps;

const mapStateToProps = (
  state: State,
  { database }: DatabaseLoaderProps,
): StateProps => ({
  idFields: Databases.selectors.getIdfields(state, {
    databaseId: database.id,
  }),
});

const mapDispatchToProps: DispatchProps = {
  onFetchIdFields: Databases.objectActions.fetchIdfields,
  onUpdateField: Fields.actions.update,
  onRescanFieldValues: rescanFieldValues,
  onDiscardFieldValues: discardFieldValues,
};

const MetadataFieldSettings = ({
  database,
  schemas,
  table,
  field,
  idFields = [],
  params: { schemaId, section },
  onFetchIdFields,
  onUpdateField,
  onRescanFieldValues,
  onDiscardFieldValues,
}: MetadataFieldSettingsProps) => {
  const databaseId = database.id;
  const schema = schemas.find(schema => schema.id === schemaId);

  const { loading, error } = useAsync(async () => {
    await onFetchIdFields(
      { id: databaseId },
      PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    );
  }, [databaseId]);

  if (loading || error || !schema) {
    return <LoadingAndErrorWrapper loading={loading} error={error} />;
  }

  return (
    <AdminLayout
      sidebar={
        <FieldSidebar
          database={database}
          schema={schema}
          table={table}
          field={field}
        />
      }
    >
      <div className="wrapper">
        <FieldBreadcrumbs
          database={database}
          schema={schema}
          table={table}
          field={field}
          hasMultipleSchemas={schemas.length > 1}
        />
        {section === "general" && (
          <MetadataFieldGeneralSettings
            field={field}
            idFields={idFields}
            onUpdateField={onUpdateField}
            onRescanFieldValues={onRescanFieldValues}
            onDiscardFieldValues={onDiscardFieldValues}
          />
        )}
      </div>
    </AdminLayout>
  );
};

interface FieldSidebarProps {
  database: Database;
  schema: Schema;
  table: Table;
  field: Field;
}

const FieldSidebar = ({
  database,
  schema,
  table,
  field,
}: FieldSidebarProps) => {
  const fieldId = Number(field.id);

  return (
    <div>
      <div className="flex align-center mb2">
        <MetadataBackButton
          selectedDatabaseId={database.id}
          selectedSchemaId={schema.id}
          selectedTableId={table.id}
        />
      </div>
      <LeftNavPane>
        <LeftNavPaneItem
          name={t`General`}
          path={Urls.dataModelField(database.id, schema.id, table.id, fieldId)}
          index
        />
        <LeftNavPaneItem
          name={t`Formatting`}
          path={Urls.dataModelFieldFormatting(
            database.id,
            schema.id,
            table.id,
            fieldId,
          )}
        />
      </LeftNavPane>
    </div>
  );
};

interface FieldBreadcrumbsProps {
  database: Database;
  schema: Schema;
  table: Table;
  field: Field;
  hasMultipleSchemas: boolean;
}

const FieldBreadcrumbs = ({
  database,
  schema,
  table,
  field,
  hasMultipleSchemas,
}: FieldBreadcrumbsProps) => {
  return (
    <div className="mb4 pt2 ml-auto mr-auto">
      <Breadcrumbs
        crumbs={[
          [database.displayName(), Urls.dataModelDatabase(database.id)],
          ...(hasMultipleSchemas
            ? [[schema.name, Urls.dataModelSchema(database.id, schema.id)]]
            : []),
          [
            table.displayName(),
            Urls.dataModelTable(database.id, schema.id, table.id),
          ],
          t`${field.displayName()} – Field Settings`,
        ]}
      />
    </div>
  );
};

export default _.compose(
  Databases.load({
    id: (_: State, { params }: RouterProps) =>
      Urls.extractEntityId(params.databaseId),
    query: PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  }),
  Schemas.loadList({
    query: (_: State, { database }: DatabaseLoaderProps) => ({
      dbId: database.id,
      include_hidden: true,
      ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    }),
  }),
  Tables.load({
    id: (_: State, { params }: RouterProps) =>
      Urls.extractEntityId(params.tableId),
    query: PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    selectorName: "getObjectUnfiltered",
  }),
  Fields.load({
    id: (_: State, { params }: RouterProps) =>
      Urls.extractEntityId(params.fieldId),
    query: PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    selectorName: "getObjectUnfiltered",
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(MetadataFieldSettings);
