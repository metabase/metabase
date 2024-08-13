import cx from "classnames";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import { AdminLayout } from "metabase/components/AdminLayout";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { LeftNavPane, LeftNavPaneItem } from "metabase/components/LeftNavPane";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import Databases from "metabase/entities/databases";
import Fields from "metabase/entities/fields";
import Schemas from "metabase/entities/schemas";
import Tables from "metabase/entities/tables";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import type Database from "metabase-lib/v1/metadata/Database";
import type Field from "metabase-lib/v1/metadata/Field";
import type Schema from "metabase-lib/v1/metadata/Schema";
import type Table from "metabase-lib/v1/metadata/Table";
import type { State } from "metabase-types/store";

import FieldFormattingSettings from "../FieldFormattingSettings";
import FieldGeneralSettings from "../FieldGeneralSettings";
import MetadataBackButton from "../MetadataBackButton";

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

interface TableLoaderProps {
  table: Table;
}

interface SchemaLoaderProps {
  schemas: Schema[];
}

interface FieldLoaderProps {
  field: Field;
}

interface FieldValuesLoaderProps {
  fetched: boolean;
  loading: boolean;
}

interface StateProps {
  idFields: Field[];
}

type MetadataFieldSettingsProps = RouterProps &
  DatabaseLoaderProps &
  SchemaLoaderProps &
  TableLoaderProps &
  FieldLoaderProps &
  FieldValuesLoaderProps &
  StateProps;

const mapStateToProps = (
  state: State,
  { database }: DatabaseLoaderProps,
): StateProps => ({
  idFields: Databases.selectors.getIdFields(state, {
    databaseId: database.id,
  }),
});

const MetadataFieldSettings = ({
  database,
  schemas,
  table,
  field,
  idFields,
  fetched = false,
  loading = true,
  params: { schemaId, section },
}: MetadataFieldSettingsProps) => {
  const schema = schemas.find(schema => schema.id === schemaId);
  if (!schema || (!fetched && loading)) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <AdminLayout
      headerHeight={53}
      sidebar={
        <FieldSidebar
          database={database}
          schema={schema}
          table={table}
          field={field}
        />
      }
    >
      <div className={CS.wrapper}>
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
      <div className={cx(CS.flex, CS.alignCenter, CS.mb2)}>
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
    <div className={cx(CS.mb4, CS.pt2, CS.mlAuto, CS.mrAuto)}>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Databases.load({
    id: (_: State, { params }: RouterProps) =>
      Urls.extractEntityId(params.databaseId),
    query: PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  }),
  Databases.load({
    id: (_: State, { params }: RouterProps) =>
      Urls.extractEntityId(params.databaseId),
    query: PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    fetchType: "fetchIdFields",
    requestType: "idFields",
  }),
  Schemas.loadList({
    query: (_: State, { params }: RouterProps) => ({
      dbId: Urls.extractEntityId(params.databaseId),
      include_hidden: true,
      ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    }),
  }),
  Tables.load({
    id: (state: State, { params }: RouterProps) =>
      Urls.extractEntityId(params.tableId),
    query: {
      include_sensitive_fields: true,
      ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    },
    fetchType: "fetchMetadataDeprecated",
    requestType: "fetchMetadataDeprecated",
    selectorName: "getObjectUnfiltered",
  }),
  Fields.load({
    id: (_: State, { params }: RouterProps) =>
      Urls.extractEntityId(params.fieldId),
    query: PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    selectorName: "getObjectUnfiltered",
    loadingAndErrorWrapper: false,
  }),
  Tables.load({
    id: (state: State, { field }: FieldLoaderProps) => field?.target?.table_id,
    query: {
      include_sensitive_fields: true,
      ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    },
    fetchType: "fetchMetadataDeprecated",
    requestType: "fetchMetadataDeprecated",
    selectorName: "getObjectUnfiltered",
    entityAlias: "foreignKeyTable",
    loadingAndErrorWrapper: false,
  }),
  Fields.load({
    id: (_: State, { params }: RouterProps) =>
      Urls.extractEntityId(params.fieldId),
    query: PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
    fetchType: "fetchFieldValues",
    requestType: "values",
    selectorName: "getObjectUnfiltered",
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps),
)(MetadataFieldSettings);
