import React, { ChangeEvent, useCallback, useMemo } from "react";
import { useAsync } from "react-use";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import * as MetabaseCore from "metabase/lib/core";
import * as Urls from "metabase/lib/urls";
import Databases from "metabase/entities/databases";
import Schemas from "metabase/entities/schemas";
import Tables from "metabase/entities/tables";
import Fields from "metabase/entities/fields";
import ActionButton from "metabase/components/ActionButton";
import AdminLayout from "metabase/components/AdminLayout";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import InputBlurChange from "metabase/components/InputBlurChange";
import { LeftNavPane, LeftNavPaneItem } from "metabase/components/LeftNavPane";
import {
  DatabaseId,
  FieldId,
  FieldValuesType,
  Schema,
} from "metabase-types/api";
import { State } from "metabase-types/store";
import Select, {
  SelectChangeEvent,
} from "metabase/core/components/Select/Select";
import Database from "metabase-lib/metadata/Database";
import Table from "metabase-lib/metadata/Table";
import Field from "metabase-lib/metadata/Field";
import { rescanFieldValues, discardFieldValues } from "../../actions";
import FieldVisibilityPicker from "../FieldVisibilityPicker";
import MetadataBackButton from "../MetadataBackButton";
import MetadataSection from "../MetadataSection";
import MetadataSectionHeader from "../MetadataSectionHeader";
import SemanticTypeAndTargetPicker from "../SemanticTypeAndTargetPicker";
import { FieldNameInput } from "./MetadataFieldSettings.styled";

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
          <FieldGeneralPane
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

interface FieldGeneralPaneProps {
  field: Field;
  idFields: Field[];
  onUpdateField: (field: Field, updates: Partial<Field>) => void;
  onRescanFieldValues: (fieldId: FieldId) => void;
  onDiscardFieldValues: (fieldId: FieldId) => void;
}

const FieldGeneralPane = ({
  field,
  idFields,
  onUpdateField,
  onRescanFieldValues,
  onDiscardFieldValues,
}: FieldGeneralPaneProps) => {
  return (
    <div>
      <FieldHeaderSection field={field} onUpdateField={onUpdateField} />
      <FieldVisibilitySection field={field} onUpdateField={onUpdateField} />
      <FieldTypeSection
        field={field}
        idFields={idFields}
        onUpdateField={onUpdateField}
      />
      {field.canUnfoldJson() && (
        <FieldJsonUnfoldingSection
          field={field}
          onUpdateField={onUpdateField}
        />
      )}
      {field.canCoerceType() && (
        <FieldCoercionStrategySection
          field={field}
          onUpdateField={onUpdateField}
        />
      )}
      <FieldValuesTypeSection field={field} onUpdateField={onUpdateField} />
      <FieldCachedValuesSection
        field={field}
        onRescanFieldValues={onRescanFieldValues}
        onDiscardFieldValues={onDiscardFieldValues}
      />
    </div>
  );
};

interface FieldHeaderSectionProps {
  field: Field;
  onUpdateField: (field: Field, updates: Partial<Field>) => void;
}

const FieldHeaderSection = ({
  field,
  onUpdateField,
}: FieldHeaderSectionProps) => {
  const handleChangeName = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.value) {
        onUpdateField(field, { display_name: event.target.value });
      } else {
        event.target.value = field.displayName();
      }
    },
    [field, onUpdateField],
  );

  const handleChangeDescription = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.value) {
        onUpdateField(field, { description: event.target.value });
      } else {
        onUpdateField(field, { description: null });
      }
    },
    [field, onUpdateField],
  );

  return (
    <MetadataSection first>
      <FieldNameInput
        name="display_name"
        className="h2"
        value={field.displayName()}
        placeholder={field.name}
        onChange={handleChangeName}
      />
      <InputBlurChange
        name="description"
        className="text-measure"
        value={field.description ?? ""}
        placeholder={t`No description for this field yet`}
        fullWidth
        onBlurChange={handleChangeDescription}
      />
    </MetadataSection>
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

interface FieldCoercionStrategySectionProps {
  field: Field;
  onUpdateField: (field: Field, updates: Partial<Field>) => void;
}

const FieldCoercionStrategySection = ({
  field,
  onUpdateField,
}: FieldCoercionStrategySectionProps) => {
  const options = useMemo(
    () => [
      ...field.coercionStrategyOptions().map(value => ({ name: value, value })),
      { name: t`Don't cast`, value: null },
    ],
    [field],
  );

  const handleChangeOption = useCallback(
    (event: SelectChangeEvent<string>) => {
      onUpdateField(field, { coercion_strategy: event.target.value });
    },
    [field, onUpdateField],
  );

  return (
    <MetadataSection>
      <MetadataSectionHeader title={t`Cast to a specific data type`} />
      <Select
        className="inline-block"
        placeholder={t`Select a conversion`}
        searchProp="name"
        value={field.coercion_strategy}
        options={options}
        onChange={handleChangeOption}
      />
    </MetadataSection>
  );
};

interface FieldValuesTypeSectionProps {
  field: Field;
  onUpdateField: (field: Field, updates: Partial<Field>) => void;
}

const FieldValuesTypeSection = ({
  field,
  onUpdateField,
}: FieldValuesTypeSectionProps) => {
  const handleChangeFieldValuesType = useCallback(
    (event: SelectChangeEvent<FieldValuesType>) => {
      onUpdateField(field, { has_field_values: event.target.value });
    },
    [field, onUpdateField],
  );

  return (
    <MetadataSection>
      <MetadataSectionHeader
        title={t`Filtering on this field`}
        description={t`When this field is used in a filter, what should people use to enter the value they want to filter on?`}
      />
      <Select
        className="inline-block"
        value={field.has_field_values}
        options={MetabaseCore.has_field_values_options}
        onChange={handleChangeFieldValuesType}
      />
    </MetadataSection>
  );
};

interface FieldCachedValuesSectionProps {
  field: Field;
  onRescanFieldValues: (fieldId: FieldId) => void;
  onDiscardFieldValues: (fieldId: FieldId) => void;
}

const FieldCachedValuesSection = ({
  field,
  onRescanFieldValues,
  onDiscardFieldValues,
}: FieldCachedValuesSectionProps) => {
  const fieldId = Number(field.id);

  const handleRescanFieldValues = useCallback(async () => {
    await onRescanFieldValues(fieldId);
  }, [fieldId, onRescanFieldValues]);

  const handleDiscardFieldValues = useCallback(async () => {
    await onDiscardFieldValues(fieldId);
  }, [fieldId, onDiscardFieldValues]);

  return (
    <MetadataSection last>
      <MetadataSectionHeader
        title={t`Cached field values`}
        description={t`Metabase can scan the values for this field to enable checkbox filters in dashboards and questions.`}
      />
      <ActionButton
        className="Button mr2"
        actionFn={handleRescanFieldValues}
        normalText={t`Re-scan this field`}
        activeText={t`Starting…`}
        failedText={t`Failed to start scan`}
        successText={t`Scan triggered!`}
      />
      <ActionButton
        className="Button Button--danger"
        actionFn={handleDiscardFieldValues}
        normalText={t`Discard cached field values`}
        activeText={t`Starting…`}
        failedText={t`Failed to discard values`}
        successText={t`Discard triggered!`}
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
  connect(mapStateToProps, mapDispatchToProps),
)(MetadataFieldSettings);
