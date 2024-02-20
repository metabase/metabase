import { Component, useMemo } from "react";
import { connect } from "react-redux";
import { Link } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import Schemas from "metabase/entities/schemas";
import MetabaseSettings from "metabase/lib/settings";
import { RequiredParamToggle } from "metabase/parameters/components/RequiredParamToggle";
import { ValuesSourceSettings } from "metabase/parameters/components/ValuesSourceSettings";
import type { EmbeddingParameterVisibility } from "metabase/public/lib/types";
import { SchemaTableAndFieldDataSelector } from "metabase/query_builder/components/DataSelector";
import { fetchField } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import { Flex, Select, Text, TextInputBlurChange } from "metabase/ui";
import type Database from "metabase-lib/metadata/Database";
import type Field from "metabase-lib/metadata/Field";
import type Metadata from "metabase-lib/metadata/Metadata";
import type Table from "metabase-lib/metadata/Table";
import { canUseCustomSource } from "metabase-lib/parameters/utils/parameter-source";
import {
  getDefaultParameterOptions,
  getDefaultParameterWidgetType,
  getParameterOptionsForField,
} from "metabase-lib/parameters/utils/template-tag-options";
import type {
  DimensionReference,
  FieldId,
  Parameter,
  RowValue,
  TemplateTag,
  TemplateTagId,
  TemplateTagType,
  ValuesQueryType,
  ValuesSourceConfig,
  ValuesSourceType,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import {
  ContainerLabel,
  DefaultParameterValueWidget,
  ErrorSpan,
  InputContainer,
  TagContainer,
  TagName,
} from "./TagEditorParam.styled";

interface Props {
  tag: TemplateTag;
  parameter: Parameter;
  embeddedParameterVisibility?: EmbeddingParameterVisibility | null;
  database?: Database | null;
  databases: Database[];
  databaseFields?: Field[];
  metadata: Metadata;
  setTemplateTag: (tag: TemplateTag) => void;
  setTemplateTagConfig: (tag: TemplateTag, config: Parameter) => void;
  setParameterValue: (tagId: TemplateTagId, value: RowValue) => void;
  fetchField: (fieldId: FieldId, force?: boolean) => void;
}

function mapStateToProps(state: State) {
  return {
    metadata: getMetadata(state),
  };
}

const mapDispatchToProps = { fetchField };

class TagEditorParamInner extends Component<Props> {
  UNSAFE_componentWillMount() {
    const { tag, fetchField } = this.props;

    if (tag.type === "dimension" && Array.isArray(tag.dimension)) {
      const fieldId = tag.dimension[1];
      // Field values might already have been loaded so force the load of other field information too
      fetchField(fieldId, true);
    }
  }

  setType = (type: TemplateTagType) => {
    const { tag, setTemplateTag, setParameterValue } = this.props;

    if (tag.type !== type) {
      setTemplateTag({
        ...tag,
        type: type,
        default: undefined,
        dimension: undefined,
        "widget-type": type === "dimension" ? "none" : undefined,
      });

      setParameterValue(tag.id, null);
    }
  };

  setWidgetType = (widgetType: string) => {
    const { tag, setTemplateTag, setParameterValue } = this.props;

    if (tag["widget-type"] !== widgetType) {
      const newTag = {
        ...tag,
        "widget-type": widgetType,
      };

      setTemplateTag({
        ...newTag,
        options: getDefaultParameterOptions(newTag),
      });

      setParameterValue(tag.id, null);
    }
  };

  setRequired = (required: boolean) => {
    const { tag, parameter, setTemplateTag, setParameterValue } = this.props;

    if (tag.required !== required) {
      setTemplateTag({ ...tag, required: required });
    }

    if (!parameter.value && required && tag.default) {
      setParameterValue(tag.id, tag.default);
    }
  };

  setQueryType = (queryType: ValuesQueryType) => {
    const { tag, parameter, setTemplateTagConfig } = this.props;

    setTemplateTagConfig(tag, {
      ...parameter,
      values_query_type: queryType,
    });
  };

  setSourceSettings = (
    sourceType: ValuesSourceType,
    sourceConfig: ValuesSourceConfig,
  ) => {
    const { tag, parameter, setTemplateTagConfig } = this.props;

    setTemplateTagConfig(tag, {
      ...parameter,
      values_source_type: sourceType,
      values_source_config: sourceConfig,
    });
  };

  setParameterAttribute(attr: keyof TemplateTag, val: any) {
    // only register an update if the value actually changes
    if (this.props.tag[attr] !== val) {
      this.props.setTemplateTag({
        ...this.props.tag,
        [attr]: val?.length > 0 ? val : null,
      });
    }
  }

  setDimension = (fieldId: FieldId) => {
    const { tag, setTemplateTag, metadata } = this.props;

    // TODO Fix raw MBQL usage
    const dimension: DimensionReference = ["field", fieldId, null];

    if (!_.isEqual(tag.dimension, dimension)) {
      const field = metadata.field(dimension[1]);
      if (!field) {
        return;
      }

      const newTag = {
        ...tag,
        dimension,
        "widget-type": getDefaultParameterWidgetType(tag, field),
      };

      setTemplateTag({
        ...newTag,
        options: getDefaultParameterOptions(newTag),
      });
    }
  };

  getFilterWidgetTypeValue = (tag: TemplateTag) => {
    // avoid `undefined` value because it makes the component "uncontrollable"
    // (see Uncontrollable.jsx, metabase#13825)
    const widgetType = tag["widget-type"] || "none";

    const isOldWidgetType =
      widgetType.startsWith("location") || widgetType === "category";

    // old parameters with widget-type of `location/state` etc. need be remapped to string/= so that the
    // dropdown is correctly populated with a set option
    return isOldWidgetType ? "string/=" : widgetType;
  };

  render() {
    const {
      tag,
      database,
      databases,
      metadata,
      parameter,
      embeddedParameterVisibility,
    } = this.props;
    let widgetOptions: { name?: string; type: string }[] = [];
    let field: Field | null = null;
    let table: Table | null | undefined = null;
    let fieldMetadataLoaded = false;
    if (tag.type === "dimension" && Array.isArray(tag.dimension)) {
      field = metadata.field(tag.dimension[1]);
      if (field) {
        widgetOptions = getParameterOptionsForField(field);
        table = field.table;
        fieldMetadataLoaded = true;
      }
    }

    const isDimension = tag.type === "dimension";
    const hasSelectedDimensionField =
      isDimension && Array.isArray(tag.dimension);
    const hasWidgetOptions = widgetOptions?.length > 0;

    return (
      <TagContainer data-testid={`tag-editor-variable-${tag.name}`}>
        <ContainerLabel paddingTop>{t`Variable name`}</ContainerLabel>
        <TagName>{tag.name}</TagName>

        <VariableTypeSelect value={tag.type} onChange={this.setType} />

        {tag.type === "dimension" && (
          <FieldMappingSelect
            tag={tag}
            hasSelectedDimensionField={hasSelectedDimensionField}
            table={table}
            field={field}
            fieldMetadataLoaded={fieldMetadataLoaded}
            database={database}
            databases={databases}
            setFieldFn={this.setDimension}
          />
        )}

        {hasSelectedDimensionField && (
          <FilterWidgetTypeSelect
            tag={tag}
            value={this.getFilterWidgetTypeValue(tag)}
            onChange={this.setWidgetType}
            options={widgetOptions}
          />
        )}

        {(hasWidgetOptions || !isDimension) && (
          <FilterWidgetLabelInput
            tag={tag}
            onChange={value =>
              this.setParameterAttribute("display-name", value)
            }
          />
        )}

        {parameter && canUseCustomSource(parameter) && (
          <InputContainer>
            <ContainerLabel>{t`How should users filter on this variable?`}</ContainerLabel>
            <ValuesSourceSettings
              parameter={parameter}
              onChangeQueryType={this.setQueryType}
              onChangeSourceSettings={this.setSourceSettings}
            />
          </InputContainer>
        )}

        <DefaultRequiredValueControl
          tag={tag}
          parameter={parameter}
          isEmbeddedDisabled={embeddedParameterVisibility === "disabled"}
          onChangeDefaultValue={value => {
            this.setParameterAttribute("default", value);
            this.props.setParameterValue(tag.id, value);
          }}
          onChangeRequired={this.setRequired}
        />
      </TagContainer>
    );
  }
}

export const TagEditorParam = connect(
  mapStateToProps,
  mapDispatchToProps,
)(TagEditorParamInner);

function VariableTypeSelect(props: {
  value: TemplateTagType;
  onChange: (value: TemplateTagType) => void;
}) {
  return (
    <InputContainer>
      <ContainerLabel>{t`Variable type`}</ContainerLabel>
      <Select
        value={props.value}
        placeholder={t`Select…`}
        onChange={props.onChange}
        data={[
          { value: "text", label: t`Text` },
          { value: "number", label: t`Number` },
          { value: "date", label: t`Date` },
          { value: "dimension", label: t`Field Filter` },
        ]}
        data-testid="variable-type-select"
      ></Select>
    </InputContainer>
  );
}

function FieldMappingSelect({
  tag,
  hasSelectedDimensionField,
  table,
  field,
  fieldMetadataLoaded,
  database,
  databases,
  setFieldFn,
}: {
  tag: TemplateTag;
  hasSelectedDimensionField: boolean;
  fieldMetadataLoaded: boolean;
  table: Table | null | undefined;
  database?: Database | null;
  databases: Database[];
  field: Field | null;
  setFieldFn: (fieldId: FieldId) => void;
}) {
  return (
    <InputContainer>
      <ContainerLabel>
        {t`Field to map to`}
        {tag.dimension == null && <ErrorSpan>{t`(required)`}</ErrorSpan>}
      </ContainerLabel>

      {(!hasSelectedDimensionField ||
        (hasSelectedDimensionField && fieldMetadataLoaded)) && (
        <Schemas.Loader id={table?.schema?.id}>
          {() => (
            <SchemaTableAndFieldDataSelector
              databases={databases}
              selectedDatabase={database || null}
              selectedDatabaseId={database?.id || null}
              selectedTable={table || null}
              selectedTableId={table?.id || null}
              selectedField={field || null}
              selectedFieldId={
                hasSelectedDimensionField ? tag?.dimension?.[1] : null
              }
              setFieldFn={setFieldFn}
              className="AdminSelect flex align-center"
              isInitiallyOpen={!tag.dimension}
              triggerIconSize={12}
              renderAsSelect={true}
            />
          )}
        </Schemas.Loader>
      )}
    </InputContainer>
  );
}

function FilterWidgetTypeSelect({
  tag,
  value,
  onChange,
  options,
}: {
  tag: TemplateTag;
  value: string;
  onChange: (widgetType: string) => void;
  options: { name?: string; type: string }[];
}) {
  const hasOptions = options.length > 0;
  const hasNoWidgetType = tag["widget-type"] === "none" || !tag["widget-type"];

  const optionsOrDefault = useMemo(
    () =>
      (hasOptions ? options : [{ name: t`None`, type: "none" }]).map(
        option => ({
          label: option.name,
          value: option.type,
        }),
      ),
    [hasOptions, options],
  );

  return (
    <InputContainer>
      <ContainerLabel>
        {t`Filter widget type`}
        {hasNoWidgetType && <ErrorSpan>({t`required`})</ErrorSpan>}
      </ContainerLabel>

      <Select
        value={value}
        onChange={onChange}
        placeholder={t`Select…`}
        data={optionsOrDefault}
        data-testid="filter-widget-type-select"
      />

      {!hasOptions && (
        <p>
          {t`There aren't any filter widgets for this type of field yet.`}{" "}
          <Link
            // eslint-disable-next-line no-unconditional-metabase-links-render -- It's hard to tell if this is still used in the app. Please see https://metaboat.slack.com/archives/C505ZNNH4/p1703243785315819
            to={MetabaseSettings.docsUrl(
              "questions/native-editor/sql-parameters",
              "the-field-filter-variable-type",
            )}
            target="_blank"
            className="link"
          >
            {t`Learn more`}
          </Link>
        </p>
      )}
    </InputContainer>
  );
}

function FilterWidgetLabelInput({
  tag,
  onChange,
}: {
  tag: TemplateTag;
  onChange: (value: string) => void;
}) {
  return (
    <InputContainer>
      <ContainerLabel>
        {t`Filter widget label`}
        {!tag["display-name"] && <ErrorSpan>({t`required`})</ErrorSpan>}
      </ContainerLabel>
      <TextInputBlurChange
        id={`tag-editor-display-name_${tag.id}`}
        value={tag["display-name"]}
        onBlurChange={e => onChange(e.target.value)}
      />
    </InputContainer>
  );
}

function DefaultRequiredValueControl({
  tag,
  parameter,
  isEmbeddedDisabled,
  onChangeDefaultValue,
  onChangeRequired,
}: {
  tag: TemplateTag;
  parameter: Parameter;
  isEmbeddedDisabled: boolean;
  onChangeDefaultValue: (value: any) => void;
  onChangeRequired: (value: boolean) => void;
}) {
  // We want to remove "default" and "required" so that it
  // doesn't show up in the default value input update button
  const parameterAmended = _.omit(
    tag.type === "text" || tag.type === "dimension"
      ? parameter || {
          fields: [],
          ...tag,
          type: tag["widget-type"] || null,
        }
      : {
          fields: [],
          hasVariableTemplateTagTarget: true,
          type:
            tag["widget-type"] || (tag.type === "date" ? "date/single" : null),
        },
    "default",
    "required",
  );

  return (
    <div>
      <ContainerLabel>
        {t`Default filter widget value`}
        {!tag.default && tag.required && <ErrorSpan>({t`required`})</ErrorSpan>}
      </ContainerLabel>

      <Flex gap="xs" direction="column">
        <DefaultParameterValueWidget
          parameter={parameterAmended}
          value={tag.default}
          setValue={onChangeDefaultValue}
          isEditing
          commitImmediately
        />

        <RequiredParamToggle
          uniqueId={tag.id}
          disabled={isEmbeddedDisabled}
          value={tag.required ?? false}
          onChange={onChangeRequired}
          disabledTooltip={
            <>
              <Text lh={1.4}>
                {t`This filter is set to disabled in an embedded question.`}
              </Text>
              <Text lh={1.4}>
                {t`To always require a value, first visit embedding settings,
            make this filter editable or locked, re-publish the
            question, then return to this page.`}
              </Text>
              <Text size="sm">
                {t`Note`}:{" "}
                {t`making it locked, will require updating the
            embedding code before proceeding, otherwise the embed will
            break.`}
              </Text>
            </>
          }
        />
      </Flex>
    </div>
  );
}
