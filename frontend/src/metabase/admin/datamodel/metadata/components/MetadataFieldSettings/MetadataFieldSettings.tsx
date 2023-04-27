import React, { useCallback } from "react";
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
import Select, {
  SelectChangeEvent,
} from "metabase/core/components/Select/Select";
import Database from "metabase-lib/metadata/Database";
import Table from "metabase-lib/metadata/Table";
import Field from "metabase-lib/metadata/Field";
import FieldVisibilityPicker from "../FieldVisibilityPicker";
import MetadataBackButton from "../MetadataBackButton";
import MetadataSection from "../MetadataSection";
import MetadataSectionHeader from "../MetadataSectionHeader";
import SemanticTypeAndTargetPicker from "../SemanticTypeAndTargetPicker";

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
  onUpdateField: (field: Field, updates: Partial<Field>) => void;
}

type MetadataFieldSettingsProps = RouterProps &
  DatabaseLoaderProps &
  SchemaLoaderProps &
  TableLoaderProps &
  FieldLoaderProps &
  StateProps &
  DispatchProps;

const MetadataFieldSettings = ({
  database,
  schemas,
  table,
  field,
  idFields = [],
  params: { schemaId, section },
  onUpdateField,
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
        {section === "general" && (
          <FieldGeneralPane
            field={field}
            idFields={idFields}
            onUpdateField={onUpdateField}
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

interface FieldGeneralPaneProps {
  field: Field;
  idFields: Field[];
  onUpdateField: (field: Field, updates: Partial<Field>) => void;
}

const FieldGeneralPane = ({
  field,
  idFields,
  onUpdateField,
}: FieldGeneralPaneProps) => {
  return (
    <div>
      <FieldVisibilitySection field={field} onUpdateField={onUpdateField} />
      <FieldTypeSection
        field={field}
        idFields={idFields}
        onUpdateField={onUpdateField}
      />
      {field.hasJsonUnfoldingSettings() && (
        <FieldJsonUnfoldingSection
          field={field}
          onUpdateField={onUpdateField}
        />
      )}
    </div>
  );
};

interface FieldVisibilitySectionProps {
  field: Field;
  onUpdateField: (field: Field, updates: Partial<Field>) => void;
}

const FieldVisibilitySection = ({
  field,
  onUpdateField,
}: FieldVisibilitySectionProps) => {
  return (
    <MetadataSection>
      <MetadataSectionHeader
        title={t`Visibility`}
        description={t`Where this field will appear throughout Metabase`}
      />
      <div style={{ maxWidth: 400 }}>
        <FieldVisibilityPicker field={field} onUpdateField={onUpdateField} />
      </div>
    </MetadataSection>
  );
};

interface FieldTypeSectionProps {
  field: Field;
  idFields: Field[];
  onUpdateField: (field: Field, updates: Partial<Field>) => void;
}

const FieldTypeSection = ({
  field,
  idFields,
  onUpdateField,
}: FieldTypeSectionProps) => {
  return (
    <MetadataSection>
      <MetadataSectionHeader title={t`Field Type`} />
      <SemanticTypeAndTargetPicker
        className="flex align-center"
        field={field}
        idFields={idFields}
        onUpdateField={onUpdateField}
        hasSeparator
      />
    </MetadataSection>
  );
};

const JSON_OPTIONS = [
  { name: t`Yes`, value: true },
  { name: t`No`, value: false },
];

interface FieldJsonUnfoldingSectionProps {
  field: Field;
  onUpdateField: (field: Field, updates: Partial<Field>) => void;
}

const FieldJsonUnfoldingSection = ({
  field,
  onUpdateField,
}: FieldJsonUnfoldingSectionProps) => {
  const handleChange = useCallback(
    (event: SelectChangeEvent<boolean>) => {
      onUpdateField(field, { json_unfolding: event.target.value });
    },
    [field, onUpdateField],
  );

  return (
    <MetadataSection>
      <MetadataSectionHeader
        title={t`Unfold JSON`}
        description={t`Unfold JSON into component fields, where each JSON key becomes a column. You can turn this off if performance is slow.`}
      />
      <Select
        className="inline-block"
        value={field.isJsonUnfolded()}
        onChange={handleChange}
        options={JSON_OPTIONS}
      />
    </MetadataSection>
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
