import { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import { ValuesSourceSettings } from "metabase/parameters/components/ValuesSourceSettings";
import type { EmbeddingParameterVisibility } from "metabase/public/lib/types";
import { getOriginalQuestion } from "metabase/query_builder/selectors";
import { fetchField } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type Field from "metabase-lib/v1/metadata/Field";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type Table from "metabase-lib/v1/metadata/Table";
import { canUseCustomSource } from "metabase-lib/v1/parameters/utils/parameter-source";
import {
  getDefaultParameterOptions,
  getDefaultParameterWidgetType,
  getParameterOptionsForField,
} from "metabase-lib/v1/parameters/utils/template-tag-options";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
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
  InputContainer,
  TagContainer,
  TagName,
  DefaultRequiredValueControl,
  FilterWidgetTypeSelect,
  FieldMappingSelect,
  FilterWidgetLabelInput,
} from "./TagEditorParamParts";
import { VariableTypeSelect } from "./TagEditorParamParts/VariableTypeSelect";

interface Props {
  tag: TemplateTag;
  parameter: Parameter;
  embeddedParameterVisibility?: EmbeddingParameterVisibility | null;
  database?: Database | null;
  databases: Database[];
  databaseFields?: Field[];
  metadata: Metadata;
  originalQuestion?: Question;
  setTemplateTag: (tag: TemplateTag) => void;
  setTemplateTagConfig: (tag: TemplateTag, config: Parameter) => void;
  setParameterValue: (tagId: TemplateTagId, value: RowValue) => void;
  fetchField: (fieldId: FieldId, force?: boolean) => void;
}

function mapStateToProps(state: State) {
  return {
    metadata: getMetadata(state),
    originalQuestion: getOriginalQuestion(state),
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
    const {
      tag,
      parameter,
      setTemplateTag,
      setParameterValue,
      setTemplateTagConfig,
      originalQuestion,
    } = this.props;

    const originalQuery = originalQuestion?.legacyQuery() as NativeQuery;
    const originalTag = originalQuery
      ?.variableTemplateTags()
      .find((originalTag: TemplateTag) => originalTag.id === tag.id);
    const originalParameter = originalQuestion
      ?.parameters()
      .find(originalParameter => originalParameter.id === parameter.id);

    if (tag.type !== type) {
      setTemplateTag({
        ...tag,
        type: type,
        default: undefined,
        dimension: undefined,
        "widget-type": type === "dimension" ? "none" : undefined,
      });

      setParameterValue(tag.id, null);

      if (!originalTag || originalTag.type !== type) {
        // clear the values_source_config when changing the type
        // as the values will most likely not work for the new type.
        setTemplateTagConfig(tag, {
          ...parameter,
          values_source_type: undefined,
          values_source_config: undefined,
          values_query_type: undefined,
        });
      } else {
        // reset the original values_source_config when changing the type
        setTemplateTagConfig(tag, {
          ...parameter,
          values_source_type: originalParameter?.values_source_type,
          values_source_config: originalParameter?.values_source_config,
          values_query_type: originalParameter?.values_query_type,
        });
      }
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
        // When we change widget types (e.g. date/relative -> date/single)
        // the previous default is likely to be incorrect
        default: null,
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
    const hasWidgetOptions = widgetOptions.length > 0;

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
