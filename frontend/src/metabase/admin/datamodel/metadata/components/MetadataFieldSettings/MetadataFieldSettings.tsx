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
import { DatabaseId, Schema, TableId } from "metabase-types/api";
import { State } from "metabase-types/store";
import Database from "metabase-lib/metadata/Database";
import Table from "metabase-lib/metadata/Table";
import Field from "metabase-lib/metadata/Field";
import MetadataBackButton from "../MetadataBackButton";
import FieldGeneralSettings from "../FieldGeneralSettings";
import FieldFormattingSettings from "../FieldFormattingSettings";

interface HasDatabaseId {
  id: DatabaseId;
}

interface HasTableId {
  id: TableId;
}

interface HasRequestParams {
  params: unknown;
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

interface FieldLoaderProps {
  field: Field;
}

interface StateProps {
  table: Table | undefined;
  idFields: Field[] | undefined;
}

interface DispatchProps {
  onFetchMetadata: (table: HasTableId, opts: HasRequestParams) => Promise<void>;
  onFetchIdFields: (database: HasDatabaseId, params: unknown) => void;
}

type MetadataFieldSettingsProps = RouterProps &
  DatabaseLoaderProps &
  SchemaLoaderProps &
  FieldLoaderProps &
  StateProps &
  DispatchProps;

const mapStateToProps = (
  state: State,
  { params: { databaseId, tableId } }: RouterProps,
): StateProps => ({
  table: Tables.selectors.getObjectUnfiltered(state, {
    entityId: Urls.extractEntityId(tableId),
  }),
  idFields: Databases.selectors.getIdfields(state, {
    databaseId: Urls.extractEntityId(databaseId),
  }),
});

const mapDispatchToProps: DispatchProps = {
  onFetchMetadata: Tables.actions.fetchMetadata,
  onFetchIdFields: Databases.objectActions.fetchIdfields,
};

const MetadataFieldSettings = ({
  database,
  schemas,
  table,
  field,
  idFields = [],
  params: { schemaId, section },
  onFetchMetadata,
  onFetchIdFields,
}: MetadataFieldSettingsProps) => {
  const databaseId = database.id;
  const tableId = field.table_id;
  const foreignKeyTableId = field.target?.table_id;
  const schema = schemas.find(schema => schema.id === schemaId);

  const { loading, error } = useAsync(async () => {
    await onFetchIdFields({ id: databaseId }, getFieldsQuery());

    if (tableId != null) {
      await onFetchMetadata({ id: tableId }, getTableQuery());
    }
  }, [databaseId, tableId]);

  useAsync(async () => {
    if (foreignKeyTableId != null) {
      await onFetchMetadata({ id: foreignKeyTableId }, getTableQuery());
    }
  }, [foreignKeyTableId]);

  if (loading || error || !schema || !table) {
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
          <FieldGeneralSettings
            field={field}
            idFields={idFields}
            table={table}
          />
        )}
        {section === "formatting" && <FieldFormattingSettings field={field} />}
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

const getTableQuery = () => ({
  params: {
    include_sensitive_fields: true,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  },
});

const getFieldsQuery = () =>
  PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps;

export default _.compose(
  Databases.load({
    id: (_: State, { params }: RouterProps) =>
      Urls.extractEntityId(params.databaseId),
    query: PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    loadingAndErrorWrapper: false,
  }),
  Schemas.loadList({
    query: (_: State, { params }: RouterProps) => ({
      dbId: Urls.extractEntityId(params.databaseId),
      include_hidden: true,
      ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    }),
    loadingAndErrorWrapper: false,
  }),
  Fields.load({
    id: (_: State, { params }: RouterProps) =>
      Urls.extractEntityId(params.fieldId),
    query: PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    selectorName: "getObjectUnfiltered",
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(MetadataFieldSettings);
