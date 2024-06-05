import PropTypes from "prop-types";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { ModelIndexes } from "metabase/entities/model-indexes";
import {
  Form,
  FormProvider,
  FormRadioGroup,
  FormTextInput,
  FormTextarea,
  FormSwitch,
} from "metabase/forms";
import { color } from "metabase/lib/colors";
import {
  field_visibility_types,
  field_semantic_types,
} from "metabase/lib/core";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import { Radio, Tabs, Box } from "metabase/ui";
import ColumnSettings, {
  hasColumnSettingsWidgets,
} from "metabase/visualizations/components/ColumnSettings";
import { getGlobalSettingsForColumn } from "metabase/visualizations/lib/settings/column";
import * as Lib from "metabase-lib";
import { isFK } from "metabase-lib/v1/types/utils/isa";

import { EDITOR_TAB_INDEXES } from "../constants";

import {
  MainFormContainer,
  ViewAsFieldContainer,
  Divider,
} from "./DatasetFieldMetadataSidebar.styled";
import MappedFieldPicker from "./MappedFieldPicker";
import SemanticTypePicker, { FKTargetPicker } from "./SemanticTypePicker";

const propTypes = {
  dataset: PropTypes.object.isRequired,
  field: PropTypes.object.isRequired,
  isLastField: PropTypes.bool.isRequired,
  handleFirstFieldFocus: PropTypes.func.isRequired,
  onFieldMetadataChange: PropTypes.func.isRequired,
  onMappedDatabaseColumnChange: PropTypes.func.isRequired,
  modelIndexes: PropTypes.array.isRequired,
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

const visibilityTypeOptions = field_visibility_types
  .filter(type => type.id !== "sensitive")
  .map(type => ({
    name: getVisibilityTypeName(type),
    value: type.id,
  }));

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
  onMappedDatabaseColumnChange,
  modelIndexes,
}) {
  const displayNameInputRef = useRef();

  const canIndex =
    dataset.isSaved() && ModelIndexes.utils.canIndexField(field, dataset);

  const initialValues = useMemo(() => {
    const values = {
      display_name: field.display_name,
      description: field.description,
      semantic_type: field.semantic_type,
      fk_target_field_id: field.fk_target_field_id || null,
      visibility_type: field.visibility_type || "normal",
      should_index:
        field.should_index ??
        ModelIndexes.utils.fieldHasIndex(modelIndexes, field),
    };
    const { isNative } = Lib.queryDisplayInfo(dataset.query());

    if (isNative) {
      values.id = field.id;
    }
    return values;
  }, [field, dataset, modelIndexes]);

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

  const onFieldMetadataChangeDebounced = useMemo(
    () => _.debounce(onFieldMetadataChange, 500),
    [onFieldMetadataChange],
  );

  const handleDisplayNameChange = useCallback(
    e =>
      onFieldMetadataChangeDebounced({
        display_name: e.target.value,
      }),
    [onFieldMetadataChangeDebounced],
  );

  const handleDescriptionChange = useCallback(
    e =>
      onFieldMetadataChangeDebounced({
        description: e.target.value,
      }),
    [onFieldMetadataChangeDebounced],
  );

  const handleSemanticTypeChange = useCallback(
    value =>
      onFieldMetadataChange({
        semantic_type: value,
      }),
    [onFieldMetadataChange],
  );

  const handleFKTargetChange = useCallback(
    value =>
      onFieldMetadataChange({
        fk_target_field_id: value,
      }),
    [onFieldMetadataChange],
  );

  const handleVisibilityTypeChange = useCallback(
    value =>
      onFieldMetadataChange({
        visibility_type: value,
      }),
    [onFieldMetadataChange],
  );

  const handleShouldIndexChange = useCallback(
    e =>
      onFieldMetadataChange({
        should_index: e.target.checked,
      }),
    [onFieldMetadataChange],
  );

  const { isNative } = Lib.queryDisplayInfo(dataset.query());

  return (
    <SidebarContent>
      <FormProvider initialValues={initialValues} enableReinitialize>
        {({ values: formFieldValues }) => {
          return (
            <Form>
              <MainFormContainer>
                <FormTextInput
                  name="display_name"
                  onChange={handleDisplayNameChange}
                  label={t`Display name`}
                  tabIndex={EDITOR_TAB_INDEXES.ESSENTIAL_FORM_FIELD}
                  ref={displayNameInputRef}
                  mb="1.5rem"
                  styles={{
                    wrapper: {
                      position: "relative",
                      "&::before": {
                        content: `"${field.name}"`,
                        position: "absolute",
                        left: "0.75rem",
                        top: "0.5rem",
                        fontSize: "0.625rem",
                        color: color("text-light"),
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: "90%",
                      },
                    },
                    input: {
                      paddingTop: "1.375rem",
                      paddingBottom: "0.5rem",
                      height: "auto",
                      fontWeight: "bold",
                    },
                  }}
                />
                <FormTextarea
                  name="description"
                  label={t`Description`}
                  tabIndex={EDITOR_TAB_INDEXES.ESSENTIAL_FORM_FIELD}
                  mb="1.5rem"
                  onChange={handleDescriptionChange}
                />
                {isNative && (
                  <Box mb="1.5rem">
                    <MappedFieldPicker
                      name="id"
                      label={t`Database column this maps to`}
                      tabIndex={EDITOR_TAB_INDEXES.ESSENTIAL_FORM_FIELD}
                      databaseId={dataset.databaseId()}
                      onChange={onMappedDatabaseColumnChange}
                    />
                  </Box>
                )}
                <Box mb="1.5rem">
                  <SemanticTypePicker
                    name="semantic_type"
                    label={t`Column type`}
                    tabIndex={EDITOR_TAB_INDEXES.ESSENTIAL_FORM_FIELD}
                    onKeyDown={onLastEssentialFieldKeyDown}
                    options={getSemanticTypeOptions()}
                    onChange={handleSemanticTypeChange}
                  />
                </Box>
                {isFK(formFieldValues) && (
                  <Box mb="1.5rem">
                    <FKTargetPicker
                      name="fk_target_field_id"
                      databaseId={dataset.databaseId()}
                      onChange={handleFKTargetChange}
                    />
                  </Box>
                )}
              </MainFormContainer>

              <Tabs value={tab} onTabChange={setTab}>
                {hasColumnFormattingOptions ? (
                  <Tabs.List px="1rem">
                    {TAB_OPTIONS.map(option => (
                      <Tabs.Tab
                        value={option.value}
                        key={`tab-${option.value}`}
                      >
                        {option.name}
                      </Tabs.Tab>
                    ))}
                  </Tabs.List>
                ) : (
                  <Divider />
                )}
                <Tabs.Panel value={TAB.SETTINGS} p="1.5rem">
                  <Box mb="1.5rem">
                    <FormRadioGroup
                      name="visibility_type"
                      label={t`This column should appear in…`}
                      labelProps={{
                        mb: "0.5rem",
                      }}
                      onChange={handleVisibilityTypeChange}
                    >
                      {visibilityTypeOptions.map(option => (
                        <Radio
                          key={`visibility-type-${option.value}`}
                          value={option.value}
                          label={option.name}
                          mb="0.5rem"
                          fw="bold"
                          styles={{
                            label: {
                              fontSize: "0.875rem",
                            },
                          }}
                        />
                      ))}
                    </FormRadioGroup>
                  </Box>
                  <ViewAsFieldContainer>
                    <ColumnSettings
                      {...columnSettingsProps}
                      allowlist={VIEW_AS_RELATED_FORMATTING_OPTIONS}
                    />
                  </ViewAsFieldContainer>
                </Tabs.Panel>
                <Tabs.Panel value={TAB.FORMATTING} p="1.5rem">
                  <ColumnSettings
                    {...columnSettingsProps}
                    denylist={HIDDEN_COLUMN_FORMATTING_OPTIONS}
                  />
                </Tabs.Panel>
              </Tabs>

              {canIndex && (
                <FormSwitch
                  name="should_index"
                  label={t`Surface individual records in search by matching against this column`}
                  px="1.5rem"
                  onChange={handleShouldIndexChange}
                />
              )}
            </Form>
          );
        }}
      </FormProvider>
    </SidebarContent>
  );
}

DatasetFieldMetadataSidebar.propTypes = propTypes;

export default memo(DatasetFieldMetadataSidebar);
