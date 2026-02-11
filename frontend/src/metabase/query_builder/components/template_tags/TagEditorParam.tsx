import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import { connect } from "metabase/lib/redux";
import { TemporalUnitSettings } from "metabase/parameters/components/ParameterSettings/TemporalUnitSettings";
import { ValuesSourceSettings } from "metabase/parameters/components/ValuesSourceSettings";
import { isSingleOrMultiSelectable } from "metabase/parameters/utils/parameter-type";
import type { EmbeddingParameterVisibility } from "metabase/public/lib/types";
import { setTemplateTagConfig } from "metabase/query_builder/actions";
import { getOriginalQuestion } from "metabase/query_builder/selectors";
import { fetchField } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import { canUseCustomSource } from "metabase-lib/v1/parameters/utils/parameter-source";
import {
  getDefaultParameterOptions,
  getDefaultParameterWidgetType,
  getParameterOptionsForField,
} from "metabase-lib/v1/parameters/utils/template-tag-options";
import type {
  DimensionReference,
  FieldId,
  Parameter,
  ParameterValuesConfig,
  RowValue,
  TableId,
  TemplateTag,
  TemplateTagId,
  TemplateTagType,
  TemporalUnit,
  ValuesQueryType,
  ValuesSourceConfig,
  ValuesSourceType,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import TagEditorParamS from "./TagEditorParam.module.css";
import {
  DefaultRequiredValueControl,
  FieldMappingSelect,
  FilterWidgetLabelInput,
  FilterWidgetTypeSelect,
  TableAliasInput,
  TableMappingSelect,
} from "./TagEditorParamParts";
import { FieldAliasInput } from "./TagEditorParamParts/FieldAliasInput";
import { ParameterMultiSelectInput } from "./TagEditorParamParts/ParameterMultiSelectInput";
import {
  ContainerLabel,
  InputContainer,
} from "./TagEditorParamParts/TagEditorParam";
import { VariableTypeSelect } from "./TagEditorParamParts/VariableTypeSelect";

interface StateProps {
  metadata: Metadata;
  originalQuestion?: Question;
}

interface DispatchProps {
  fetchField: (fieldId: FieldId, force?: boolean) => void;
  setTemplateTagConfig: (
    tag: TemplateTag,
    config: ParameterValuesConfig,
  ) => void;
}

interface OwnProps {
  tag: TemplateTag;
  /**
   * parameter can be undefined when it's an incomplete "Field Filter", i.e. when
   * `field` ("Field to map to" input) is not set yet.
   */
  parameter: Parameter | undefined;
  embeddedParameterVisibility?: EmbeddingParameterVisibility | null;
  database?: Database | null;
  databases: Database[];
  setTemplateTag: (tag: TemplateTag) => void;
  setParameterValue: (tagId: TemplateTagId, value: RowValue) => void;
}

function mapStateToProps(state: State) {
  return {
    metadata: getMetadata(state),
    originalQuestion: getOriginalQuestion(state),
  };
}

const mapDispatchToProps = { fetchField, setTemplateTagConfig };

const EMPTY_VALUES_CONFIG: ParameterValuesConfig = {
  isMultiSelect: false,
  values_query_type: undefined,
  values_source_type: undefined,
  values_source_config: undefined,
  temporal_units: undefined,
};

class TagEditorParamInner extends Component<
  OwnProps & StateProps & DispatchProps
> {
  UNSAFE_componentWillMount() {
    const { tag, fetchField } = this.props;

    if (tag.type === "dimension" && Array.isArray(tag.dimension)) {
      const fieldId = tag.dimension[1];
      // Field values might already have been loaded so force the load of other field information too
      fetchField(fieldId, true);
    }
  }

  getTemplateTagConfigAfterTypeChange = (
    newType: TemplateTagType,
  ): ParameterValuesConfig => {
    const { tag, parameter, originalQuestion } = this.props;
    if (!parameter) {
      return EMPTY_VALUES_CONFIG;
    }

    const newConfig: ParameterValuesConfig = {
      ...EMPTY_VALUES_CONFIG,
      isMultiSelect: isSingleOrMultiSelectable(parameter)
        ? parameter.isMultiSelect
        : false,
    };
    if (!originalQuestion) {
      return newConfig;
    }

    const originalQuery = originalQuestion.query();
    const originalQueryInfo = Lib.queryDisplayInfo(originalQuery);
    if (!originalQueryInfo.isNative) {
      return newConfig;
    }

    const originalTag = Lib.templateTags(originalQuery)[tag.name];
    const originalParameter = originalQuestion
      .parameters()
      .find(({ id }) => id === parameter.id);
    if (!originalTag || originalTag.type !== newType || !originalParameter) {
      return newConfig;
    }

    return {
      ...newConfig,
      values_source_type: originalParameter.values_source_type,
      values_source_config: originalParameter.values_source_config,
      values_query_type: originalParameter.values_query_type,
    };
  };

  setType = (type: TemplateTagType) => {
    const { tag, setTemplateTag, setParameterValue, setTemplateTagConfig } =
      this.props;

    if (tag.type !== type) {
      setTemplateTag({
        ...tag,
        type: type,
        default: undefined,
        dimension: undefined,
        alias: undefined,
        "widget-type": type === "dimension" ? "none" : undefined,
        "table-id": undefined,
      });

      setParameterValue(tag.id, null);
      setTemplateTagConfig(tag, this.getTemplateTagConfigAfterTypeChange(type));
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

    if (!parameter) {
      // this handler is attached to a component rendered only when parameter is truthy
      // so this case should never happen
      return;
    }

    if (!parameter.value && required && tag.default) {
      setParameterValue(tag.id, tag.default);
    }
  };

  setQueryType = (queryType: ValuesQueryType) => {
    const { tag, parameter, setTemplateTagConfig } = this.props;

    setTemplateTagConfig(tag, {
      ...(parameter ?? {}),
      values_query_type: queryType,
    });
  };

  setSourceSettings = (
    sourceType: ValuesSourceType,
    sourceConfig: ValuesSourceConfig,
  ) => {
    const { tag, parameter, setTemplateTagConfig } = this.props;

    setTemplateTagConfig(tag, {
      ...(parameter ?? {}),
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

      const newTag: TemplateTag = {
        ...tag,
        dimension,
        alias: undefined,
        ...(tag.type === "dimension"
          ? { "widget-type": getDefaultParameterWidgetType(tag, field) }
          : {}),
      };

      setTemplateTag({
        ...newTag,
        options: getDefaultParameterOptions(newTag),
      });
    }
  };

  setTableId = (tableId: TableId) => {
    const { tag, setTemplateTag } = this.props;
    if (tag["table-id"] !== tableId) {
      setTemplateTag({ ...tag, alias: undefined, "table-id": tableId });
    }
  };

  setAlias = (alias: string | undefined) => {
    const { tag, setTemplateTag } = this.props;
    if (tag.alias !== alias) {
      setTemplateTag({ ...tag, "table-id": undefined, alias });
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
    if (isOldWidgetType) {
      return "string/=";
    }

    return widgetType;
  };

  render() {
    const {
      tag,
      database,
      databases,
      metadata,
      parameter,
      embeddedParameterVisibility,
      setTemplateTagConfig,
    } = this.props;

    const isDimension = tag.type === "dimension";
    const isTemporalUnit = tag.type === "temporal-unit";
    const isTable = tag.type === "table";
    const field = Array.isArray(tag.dimension)
      ? metadata.field(tag.dimension[1])
      : null;
    const widgetOptions =
      field != null ? getParameterOptionsForField(field) : [];

    return (
      <Box
        className={TagEditorParamS.TagContainer}
        data-testid={`tag-editor-variable-${tag.name}`}
      >
        <ContainerLabel>{t`Variable name`}</ContainerLabel>
        <Box component="h3" className={TagEditorParamS.TagName}>
          {tag.name}
        </Box>
        <VariableTypeSelect value={tag.type} onChange={this.setType} />

        {(isDimension || isTemporalUnit) && (
          <FieldMappingSelect
            tag={tag}
            field={field}
            database={database}
            databases={databases}
            setFieldFn={this.setDimension}
          />
        )}

        {isTable && (
          <>
            <TableMappingSelect
              tag={tag}
              database={database}
              databases={databases}
              onChange={this.setTableId}
            />
            <TableAliasInput tag={tag} onChange={this.setAlias} />
          </>
        )}

        {(isDimension || isTemporalUnit) && field != null && (
          <FieldAliasInput tag={tag} onChange={this.setAlias} />
        )}

        {isDimension && field != null && (
          <FilterWidgetTypeSelect
            tag={tag}
            value={this.getFilterWidgetTypeValue(tag)}
            onChange={this.setWidgetType}
            options={widgetOptions}
          />
        )}

        {((!isDimension && !isTable) || widgetOptions.length > 0) && (
          <FilterWidgetLabelInput
            tag={tag}
            onChange={(value) =>
              this.setParameterAttribute("display-name", value)
            }
          />
        )}

        {parameter && isTemporalUnit && (
          <>
            <ContainerLabel>{t`Time grouping options`}</ContainerLabel>
            <Box mb="xl">
              <TemporalUnitSettings
                parameter={parameter}
                onChangeTemporalUnits={(newTemporalUnits) => {
                  setTemplateTagConfig(tag, {
                    temporal_units: newTemporalUnits,
                  });

                  if (tag.default != null) {
                    if (
                      !newTemporalUnits.includes(tag.default as TemporalUnit)
                    ) {
                      // reset value as it's not on the new list of available options
                      this.setParameterAttribute("default", null);
                      this.props.setParameterValue(tag.id, null);
                    }
                  }
                }}
              />
            </Box>
          </>
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

        {parameter && isSingleOrMultiSelectable(parameter) && (
          <ParameterMultiSelectInput
            tag={tag}
            parameter={parameter}
            onChangeMultiSelect={(isMultiSelect) =>
              setTemplateTagConfig(tag, { isMultiSelect })
            }
          />
        )}

        {parameter && (
          <DefaultRequiredValueControl
            tag={tag}
            parameter={parameter}
            isEmbeddedDisabled={embeddedParameterVisibility === "disabled"}
            onChangeDefaultValue={(value) => {
              this.setParameterAttribute("default", value);
              this.props.setParameterValue(tag.id, value);
            }}
            onChangeRequired={this.setRequired}
          />
        )}
      </Box>
    );
  }
}

export const TagEditorParam = connect<
  StateProps,
  DispatchProps,
  OwnProps,
  State
>(
  mapStateToProps,
  mapDispatchToProps,
)(TagEditorParamInner);
