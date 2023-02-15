import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";
import { usePrevious } from "react-use";

import Radio from "metabase/core/components/Radio";

import {
  field_visibility_types,
  field_semantic_types,
} from "metabase/lib/core";
import { getSemanticTypeIcon } from "metabase/lib/schema_metadata";
import RootForm from "metabase/containers/FormikForm";

import SidebarContent from "metabase/query_builder/components/SidebarContent";
import ColumnSettings, {
  hasColumnSettingsWidgets,
} from "metabase/visualizations/components/ColumnSettings";
import { getGlobalSettingsForColumn } from "metabase/visualizations/lib/settings/column";
import { isSameField } from "metabase-lib/queries/utils/field-ref";
import { isFK } from "metabase-lib/types/utils/isa";

import { EDITOR_TAB_INDEXES } from "../constants";
import MappedFieldPicker from "./MappedFieldPicker";
import SemanticTypePicker, { FKTargetPicker } from "./SemanticTypePicker";
import {
  AnimatableContent,
  MainFormContainer,
  SecondaryFormContainer,
  FormTabsContainer,
  ViewAsFieldContainer,
  Divider,
} from "./DatasetFieldMetadataSidebar.styled";

const propTypes = {
  dataset: PropTypes.object.isRequired,
  field: PropTypes.object.isRequired,
  isLastField: PropTypes.bool.isRequired,
  handleFirstFieldFocus: PropTypes.func.isRequired,
  onFieldMetadataChange: PropTypes.func.isRequired,
};

function getVisibilityTypeName(visibilityType) {
  if (visibilityType.id === "normal") {
    return t`Table and details views`;
  }
  if (visibilityType.id === "details-only") {
    return t`Detail views only`;
  }
  return visibilityType.name;
}

function getSemanticTypeOptions() {
  return [
    ...field_semantic_types,
    {
      id: null,
      name: t`No special type`,
      section: t`Other`,
    },
  ];
}

function getFormFields({ dataset, field }) {
  const visibilityTypeOptions = field_visibility_types
    .filter(type => type.id !== "sensitive")
    .map(type => ({
      name: getVisibilityTypeName(type),
      value: type.id,
    }));

  return formFieldValues =>
    [
      {
        name: "display_name",
        title: t`Display name`,
        subtitle: field.name,
      },
      {
        name: "description",
        title: t`Description`,
        placeholder: t`It’s optional, but oh, so helpful`,
        type: "text",
      },
      dataset.isNative() && {
        name: "id",
        title: t`Database column this maps to`,
        widget: MappedFieldPicker,
        databaseId: dataset.databaseId(),
      },
      {
        name: "semantic_type",
        title: t`Column type`,
        widget: SemanticTypePicker,
        options: getSemanticTypeOptions(),
        icon: getSemanticTypeIcon(formFieldValues?.semantic_type, "ellipsis"),
      },
      {
        name: "fk_target_field_id",
        hidden: !isFK(formFieldValues),
        widget: FKTargetPicker,
        databaseId: dataset.databaseId(),
      },
      {
        name: "visibility_type",
        title: t`This column should appear in…`,
        type: "radio",
        options: visibilityTypeOptions,
      },
    ].filter(Boolean);
}

const VIEW_AS_FIELDS = ["view_as", "link_text", "link_url"];

const HIDDEN_COLUMN_FORMATTING_OPTIONS = new Set([
  "column_title",
  ...VIEW_AS_FIELDS,
]);

const VIEW_AS_RELATED_FORMATTING_OPTIONS = new Set(VIEW_AS_FIELDS);

const TAB = {
  SETTINGS: "settings",
  FORMATTING: "formatting",
};

const TAB_OPTIONS = [
  { name: t`Settings`, value: TAB.SETTINGS },
  { name: t`Formatting`, value: TAB.FORMATTING },
];

function DatasetFieldMetadataSidebar({
  dataset,
  field,
  isLastField,
  handleFirstFieldFocus,
  onFieldMetadataChange,
}) {
  const displayNameInputRef = useRef();
  const [shouldAnimateFieldChange, setShouldAnimateFieldChange] =
    useState(false);
  const previousField = usePrevious(field);

  useEffect(() => {
    if (!isSameField(field.field_ref, previousField?.field_ref)) {
      setShouldAnimateFieldChange(true);
      // setTimeout is required as form fields are rerendered pretty frequently
      setTimeout(() => {
        if (_.isFunction(displayNameInputRef.current?.select)) {
          displayNameInputRef.current.select();
        }
      });
    }
  }, [field, previousField]);

  const initialValues = useMemo(() => {
    const values = {
      display_name: field.display_name,
      description: field.description,
      semantic_type: field.semantic_type,
      fk_target_field_id: field.fk_target_field_id || null,
      visibility_type: field.visibility_type || "normal",
    };
    if (dataset.isNative()) {
      values.id = field.id;
    }
    return values;
  }, [field, dataset]);

  const form = useMemo(
    () => ({
      fields: getFormFields({ dataset, field }),
    }),
    [field, dataset],
  );

  const [tab, setTab] = useState(TAB.SETTINGS);

  const handleFormattingSettingsChange = useCallback(
    settings => {
      onFieldMetadataChange({ settings });
    },
    [onFieldMetadataChange],
  );

  const columnSettingsProps = useMemo(
    () => ({
      column: field,
      value: field.settings,
      onChangeSetting: handleFormattingSettingsChange,
      inheritedSettings: getGlobalSettingsForColumn(field),
      variant: "form-field",
    }),
    [field, handleFormattingSettingsChange],
  );

  const hasColumnFormattingOptions = useMemo(
    () =>
      hasColumnSettingsWidgets({
        ...columnSettingsProps,
        denylist: HIDDEN_COLUMN_FORMATTING_OPTIONS,
      }),
    [columnSettingsProps],
  );

  useEffect(() => {
    if (!hasColumnFormattingOptions && tab !== TAB.SETTINGS) {
      setTab(TAB.SETTINGS);
    }
  }, [tab, hasColumnFormattingOptions]);

  const onLastEssentialFieldKeyDown = useCallback(
    e => {
      const isNextFieldAction = !e.shiftKey && e.key === "Tab";
      if (isNextFieldAction && isLastField) {
        e.preventDefault();
        handleFirstFieldFocus();
      }
    },
    [isLastField, handleFirstFieldFocus],
  );

  const onFieldChangeAnimationEnd = useCallback(() => {
    setShouldAnimateFieldChange(false);
  }, []);

  const onFieldMetadataChangeDebounced = useMemo(
    () => _.debounce(onFieldMetadataChange, 500),
    [onFieldMetadataChange],
  );

  const onDisplayNameChange = useCallback(
    e => {
      onFieldMetadataChangeDebounced({
        display_name: e.target.value,
      });
    },
    [onFieldMetadataChangeDebounced],
  );

  const onDescriptionChange = useCallback(
    e => {
      onFieldMetadataChangeDebounced({
        description: e.target.value,
      });
    },
    [onFieldMetadataChangeDebounced],
  );

  const onMappedDatabaseColumnChange = useCallback(
    fieldId => {
      onFieldMetadataChangeDebounced({
        id: fieldId,
      });
    },
    [onFieldMetadataChangeDebounced],
  );

  const onSemanticTypeChange = useCallback(
    e => {
      onFieldMetadataChange({
        semantic_type: e.target.value,
      });
    },
    [onFieldMetadataChange],
  );

  const onFKTargetFieldChange = useCallback(
    e => {
      onFieldMetadataChange({
        fk_target_field_id: e.target.value,
      });
    },
    [onFieldMetadataChange],
  );

  const onVisibilityTypeChange = useCallback(
    value => {
      onFieldMetadataChange({
        visibility_type: value,
      });
    },
    [onFieldMetadataChange],
  );

  return (
    <SidebarContent>
      <AnimatableContent
        animated={shouldAnimateFieldChange}
        onAnimationEnd={onFieldChangeAnimationEnd}
      >
        <RootForm
          form={form}
          initialValues={initialValues}
          overwriteOnInitialValuesChange
        >
          {({ Form, FormField }) => (
            <Form>
              <MainFormContainer>
                <FormField
                  name="display_name"
                  onChange={onDisplayNameChange}
                  tabIndex={EDITOR_TAB_INDEXES.ESSENTIAL_FORM_FIELD}
                  ref={displayNameInputRef}
                />
                <FormField
                  name="description"
                  onChange={onDescriptionChange}
                  tabIndex={EDITOR_TAB_INDEXES.ESSENTIAL_FORM_FIELD}
                />
                {dataset.isNative() && (
                  <FormField
                    name="id"
                    tableId={field.table_id}
                    onChange={onMappedDatabaseColumnChange}
                    tabIndex={EDITOR_TAB_INDEXES.ESSENTIAL_FORM_FIELD}
                  />
                )}
                <FormField
                  name="semantic_type"
                  onChange={onSemanticTypeChange}
                  tabIndex={EDITOR_TAB_INDEXES.ESSENTIAL_FORM_FIELD}
                  onKeyDown={onLastEssentialFieldKeyDown}
                />
                <FormField
                  name="fk_target_field_id"
                  onChange={onFKTargetFieldChange}
                />
              </MainFormContainer>
              {hasColumnFormattingOptions && (
                <FormTabsContainer>
                  <Radio
                    value={tab}
                    options={TAB_OPTIONS}
                    onChange={setTab}
                    variant="underlined"
                  />
                </FormTabsContainer>
              )}
              <Divider />
              <SecondaryFormContainer>
                {tab === TAB.SETTINGS ? (
                  <React.Fragment>
                    <FormField
                      name="visibility_type"
                      onChange={onVisibilityTypeChange}
                    />
                    <ViewAsFieldContainer>
                      <ColumnSettings
                        {...columnSettingsProps}
                        allowlist={VIEW_AS_RELATED_FORMATTING_OPTIONS}
                      />
                    </ViewAsFieldContainer>
                  </React.Fragment>
                ) : (
                  <ColumnSettings
                    {...columnSettingsProps}
                    denylist={HIDDEN_COLUMN_FORMATTING_OPTIONS}
                  />
                )}
              </SecondaryFormContainer>
            </Form>
          )}
        </RootForm>
      </AnimatableContent>
    </SidebarContent>
  );
}

DatasetFieldMetadataSidebar.propTypes = propTypes;

export default React.memo(DatasetFieldMetadataSidebar);
