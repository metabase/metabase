import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";

import Radio from "metabase/components/Radio";

import Databases from "metabase/entities/databases";
import Field from "metabase-lib/lib/metadata/Field";
import {
  field_visibility_types,
  field_semantic_types,
  has_field_values_options,
} from "metabase/lib/core";
import { keyForColumn } from "metabase/lib/dataset";
import { isSameField } from "metabase/lib/query/field_ref";

import RootForm from "metabase/containers/Form";
import { usePrevious } from "metabase/hooks/use-previous";

import SidebarContent from "metabase/query_builder/components/SidebarContent";
import ColumnSettings, {
  hasColumnSettingsWidgets,
} from "metabase/visualizations/components/ColumnSettings";
import { getGlobalSettingsForColumn } from "metabase/visualizations/lib/settings/column";

import { updateCardVisualizationSettings } from "metabase/query_builder/actions";

import { EDITOR_TAB_INDEXES } from "../constants";
import MappedFieldPicker from "./MappedFieldPicker";
import SemanticTypePicker from "./SemanticTypePicker";
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
  field: PropTypes.instanceOf(Field),
  isLastField: PropTypes.bool.isRequired,
  IDFields: PropTypes.array.isRequired,
  handleFirstFieldFocus: PropTypes.func.isRequired,
  updateCardVisualizationSettings: PropTypes.func.isRequired,
};

function mapStateToProps(state, { dataset }) {
  const databaseId = dataset.databaseId();
  return {
    IDFields: Databases.selectors.getIdfields(state, { databaseId }),
  };
}

const mapDispatchToProps = { updateCardVisualizationSettings };

function getVisibilityTypeName(visibilityType) {
  if (visibilityType.id === "normal") {
    return t`Table and details views`;
  }
  if (visibilityType.id === "details-only") {
    return t`Detail views only`;
  }
  return visibilityType.name;
}

function getFormFields({ dataset, IDFields }) {
  const visibilityTypeOptions = field_visibility_types
    .filter(type => type.id !== "sensitive")
    .map(type => ({
      name: getVisibilityTypeName(type),
      value: type.id,
    }));

  function MappedFieldWidget(formFieldProps) {
    return <MappedFieldPicker {...formFieldProps} dataset={dataset} />;
  }

  function SemanticTypeWidget(formFieldProps) {
    return (
      <SemanticTypePicker
        {...formFieldProps}
        options={[
          ...field_semantic_types,
          {
            id: null,
            name: t`No special type`,
            section: t`Other`,
          },
        ]}
        IDFields={IDFields}
      />
    );
  }

  return [
    { name: "display_name", title: t`Display name` },
    {
      name: "description",
      title: t`Description`,
      placeholder: t`It’s optional, but oh, so helpful`,
      type: "text",
    },
    dataset.isNative() && {
      name: "id",
      title: t`Database column this maps to`,
      widget: MappedFieldWidget,
    },
    {
      name: "semantic_type",
      title: t`Column type`,
      widget: SemanticTypeWidget,
    },
    {
      name: "visibility_type",
      title: t`This column should appear in…`,
      type: "radio",
      options: visibilityTypeOptions,
    },
    {
      name: "has_field_values",
      title: t`Filtering on this field`,
      info: t`When this field is used in a filter, what should people use to enter the value they want to filter on?`,
      type: "select",
      options: has_field_values_options,
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
  IDFields,
  handleFirstFieldFocus,
  updateCardVisualizationSettings,
}) {
  const displayNameInputRef = useRef();
  const [shouldAnimateFieldChange, setShouldAnimateFieldChange] = useState(
    false,
  );
  const previousField = usePrevious(field);

  useEffect(() => {
    if (field && !isSameField(field?.field_ref, previousField?.field_ref)) {
      setShouldAnimateFieldChange(true);
      // setTimeout is required as form fields are rerendered pretty frequently
      setTimeout(() => {
        displayNameInputRef.current.select();
      });
    }
  }, [field, previousField]);

  const initialValues = useMemo(() => {
    const values = {
      display_name: field?.display_name,
      description: field?.description,
      semantic_type: field?.semantic_type,
      visibility_type: "normal",
      display_as: "text",
      has_field_values: "search",
    };
    if (dataset.isNative()) {
      values.id = field?.id;
    }
    return values;
  }, [field, dataset]);

  const formFields = useMemo(() => getFormFields({ dataset, IDFields }), [
    dataset,
    IDFields,
  ]);

  const [tab, setTab] = useState(TAB.SETTINGS);

  const fieldFormattingSettings = useMemo(() => {
    if (!field) {
      return {};
    }
    const fieldKey = keyForColumn(field);
    const columnSettings = dataset.setting("column_settings", {});
    return columnSettings[fieldKey] || {};
  }, [dataset, field]);

  const handleFormattingSettingsChange = useCallback(
    settings => {
      const fieldKey = keyForColumn(field);
      const nextFieldSettings = {
        ...fieldFormattingSettings,
        ...settings,
      };
      updateCardVisualizationSettings({
        column_settings: {
          ...dataset.setting("column_settings"),
          [fieldKey]: nextFieldSettings,
        },
      });
    },
    [dataset, field, fieldFormattingSettings, updateCardVisualizationSettings],
  );

  const columnSettingsProps = useMemo(
    () => ({
      column: field,
      value: fieldFormattingSettings,
      onChange: handleFormattingSettingsChange,
      inheritedSettings: getGlobalSettingsForColumn(field),
      variant: "form-field",
    }),
    [field, fieldFormattingSettings, handleFormattingSettingsChange],
  );

  const hasColumnFormattingOptions = useMemo(
    () =>
      field &&
      hasColumnSettingsWidgets({
        ...columnSettingsProps,
        denylist: HIDDEN_COLUMN_FORMATTING_OPTIONS,
      }),
    [field, columnSettingsProps],
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

  return (
    <SidebarContent>
      <AnimatableContent
        animated={shouldAnimateFieldChange}
        onAnimationEnd={onFieldChangeAnimationEnd}
      >
        {field && (
          <RootForm
            fields={formFields}
            initialValues={initialValues}
            overwriteOnInitialValuesChange
          >
            {({ Form, FormField }) => (
              <Form>
                <MainFormContainer>
                  <FormField
                    name="display_name"
                    ref={displayNameInputRef}
                    tabIndex={EDITOR_TAB_INDEXES.ESSENTIAL_FORM_FIELD}
                  />
                  <FormField
                    name="description"
                    tabIndex={EDITOR_TAB_INDEXES.ESSENTIAL_FORM_FIELD}
                  />
                  {dataset.isNative() && (
                    <FormField
                      name="id"
                      tabIndex={EDITOR_TAB_INDEXES.ESSENTIAL_FORM_FIELD}
                    />
                  )}
                  <FormField
                    name="semantic_type"
                    tabIndex={EDITOR_TAB_INDEXES.ESSENTIAL_FORM_FIELD}
                    onKeyDown={onLastEssentialFieldKeyDown}
                  />
                </MainFormContainer>
                {hasColumnFormattingOptions && (
                  <FormTabsContainer>
                    <Radio
                      value={tab}
                      options={TAB_OPTIONS}
                      onChange={setTab}
                      variant="underlined"
                      py={1}
                    />
                  </FormTabsContainer>
                )}
                <Divider />
                <SecondaryFormContainer>
                  {tab === TAB.SETTINGS ? (
                    <React.Fragment>
                      <FormField name="visibility_type" />
                      <ViewAsFieldContainer>
                        <ColumnSettings
                          {...columnSettingsProps}
                          allowlist={VIEW_AS_RELATED_FORMATTING_OPTIONS}
                        />
                      </ViewAsFieldContainer>
                      <FormField name="has_field_values" />
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
        )}
      </AnimatableContent>
    </SidebarContent>
  );
}

DatasetFieldMetadataSidebar.propTypes = propTypes;

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(DatasetFieldMetadataSidebar);
