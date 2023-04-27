import React from "react";
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
import { Schema } from "metabase-types/api";
import { State } from "metabase-types/store";
import Database from "metabase-lib/metadata/Database";
import Table from "metabase-lib/metadata/Table";
import Field from "metabase-lib/metadata/Field";
import MetadataBackButton from "../MetadataBackButton";

interface RouterParams {
  databaseId: string;
  schemaId: string;
  tableId: string;
  fieldId: string;
}

interface RouterProps {
  params: RouterParams;
}

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

type MetadataFieldSettingsProps = RouterProps &
  DatabaseLoaderProps &
  SchemaLoaderProps &
  TableLoaderProps &
  FieldLoaderProps;

const MetadataFieldSettings = ({
  database,
  schemas,
  table,
  field,
  params: { schemaId },
}: MetadataFieldSettingsProps) => {
  const schema = schemas.find(schema => schema.id === schemaId);

  if (!schema) {
    return <LoadingAndErrorWrapper loading />;
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
)(MetadataFieldSettings);
