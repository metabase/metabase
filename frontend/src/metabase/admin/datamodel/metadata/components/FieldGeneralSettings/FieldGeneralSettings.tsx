import { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import * as MetabaseCore from "metabase/lib/core";
import Fields from "metabase/entities/fields";
import ActionButton from "metabase/components/ActionButton";
import InputBlurChange from "metabase/components/InputBlurChange";
import type { FieldId, FieldValuesType } from "metabase-types/api";
import type { SelectChangeEvent } from "metabase/core/components/Select/Select";
import Select from "metabase/core/components/Select/Select";
import type Field from "metabase-lib/metadata/Field";
import type Table from "metabase-lib/metadata/Table";
import { discardFieldValues, rescanFieldValues } from "../../actions";
import FieldRemappingSettings from "../FieldRemappingSettings";
import FieldVisibilityPicker from "../FieldVisibilityPicker";
import MetadataSection from "../MetadataSection";
import MetadataSectionHeader from "../MetadataSectionHeader";
import SemanticTypeAndTargetPicker from "../SemanticTypeAndTargetPicker";
import { FieldNameInput } from "./FieldGeneralSettings.styled";

interface OwnProps {
  field: Field;
  idFields: Field[];
  table: Table;
}

interface DispatchProps {
  onUpdateField: (field: Field, updates: Partial<Field>) => void;
  onRescanFieldValues: (fieldId: FieldId) => void;
  onDiscardFieldValues: (fieldId: FieldId) => void;
}

type FieldGeneralSettingsProps = OwnProps & DispatchProps;

const mapDispatchToProps: DispatchProps = {
  onUpdateField: Fields.actions.updateField,
  onRescanFieldValues: rescanFieldValues,
  onDiscardFieldValues: discardFieldValues,
};

const FieldGeneralSettings = ({
  field,
  idFields,
  table,
  onUpdateField,
  onRescanFieldValues,
  onDiscardFieldValues,
}: FieldGeneralSettingsProps) => {
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
      <FieldRemappingSection field={field} table={table} />
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
    (event: { target: HTMLInputElement }) => {
      if (event.target.value) {
        onUpdateField(field, { display_name: event.target.value });
      } else {
        event.target.value = field.displayName();
      }
    },
    [field, onUpdateField],
  );

  const handleChangeDescription = useCallback(
    (event: { target: HTMLInputElement }) => {
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
        onBlurChange={handleChangeName}
      />
      <InputBlurChange
        name="description"
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

interface FieldRemappingSectionProps {
  field: Field;
  table: Table;
}

const FieldRemappingSection = ({
  field,
  table,
}: FieldRemappingSectionProps) => {
  return (
    <MetadataSection>
      <MetadataSectionHeader
        title={t`Display values`}
        description={t`Choose to show the original value from the database, or have this field display associated or custom information.`}
      />
      <FieldRemappingSettings field={field} table={table} />
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(FieldGeneralSettings);
