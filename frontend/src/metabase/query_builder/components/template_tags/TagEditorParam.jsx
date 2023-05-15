/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";
import { connect } from "react-redux";
import { Link } from "react-router";

import Schemas from "metabase/entities/schemas";
import Toggle from "metabase/core/components/Toggle";
import InputBlurChange from "metabase/components/InputBlurChange";
import Select, { Option } from "metabase/core/components/Select";

import ValuesSourceSettings from "metabase/parameters/components/ValuesSourceSettings";

import { fetchField } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";
import { SchemaTableAndFieldDataSelector } from "metabase/query_builder/components/DataSelector";
import MetabaseSettings from "metabase/lib/settings";
import { canUseCustomSource } from "metabase-lib/parameters/utils/parameter-source";

import {
  getDefaultParameterWidgetType,
  getParameterOptionsForField,
} from "metabase-lib/parameters/utils/template-tag-options";
import {
  ContainerLabel,
  DefaultParameterValueWidget,
  ErrorSpan,
  InputContainer,
  TagContainer,
  TagName,
} from "./TagEditorParam.styled";

const propTypes = {
  tag: PropTypes.object.isRequired,
  parameter: PropTypes.object,
  database: PropTypes.object,
  databases: PropTypes.array,
  setTemplateTag: PropTypes.func.isRequired,
  setTemplateTagConfig: PropTypes.func.isRequired,
  setParameterValue: PropTypes.func.isRequired,
  fetchField: PropTypes.func.isRequired,
  metadata: PropTypes.object.isRequired,
};

export class TagEditorParam extends Component {
  UNSAFE_componentWillMount() {
    const { tag, fetchField } = this.props;

    if (tag.type === "dimension" && Array.isArray(tag.dimension)) {
      const fieldId = tag.dimension[1];
      // Field values might already have been loaded so force the load of other field information too
      fetchField(fieldId, true);
    }
  }

  setType(type) {
    const { tag, setTemplateTag } = this.props;

    if (tag.type !== type) {
      setTemplateTag({
        ...tag,
        type: type,
        default: undefined,
        dimension: undefined,
        "widget-type": type === "dimension" ? "none" : undefined,
      });
    }
  }

  setWidgetType(widgetType) {
    const { tag, setTemplateTag, setParameterValue } = this.props;

    if (tag["widget-type"] !== widgetType) {
      setTemplateTag({ ...this.props.tag, "widget-type": widgetType });
      setParameterValue(tag.id, null);
    }
  }

  setRequired(required) {
    const { tag, setTemplateTag } = this.props;

    if (tag.required !== required) {
      setTemplateTag({ ...tag, required: required, default: undefined });
    }
  }

  setQueryType = queryType => {
    const { tag, parameter, setTemplateTagConfig } = this.props;

    setTemplateTagConfig(tag, {
      ...parameter,
      values_query_type: queryType,
    });
  };

  setSourceSettings = (sourceType, sourceConfig) => {
    const { tag, parameter, setTemplateTagConfig } = this.props;

    setTemplateTagConfig(tag, {
      ...parameter,
      values_source_type: sourceType,
      values_source_config: sourceConfig,
    });
  };

  setParameterAttribute(attr, val) {
    // only register an update if the value actually changes
    if (this.props.tag[attr] !== val) {
      this.props.setTemplateTag({
        ...this.props.tag,
        [attr]: val,
      });
    }
  }

  setDimension(fieldId) {
    const { tag, setTemplateTag, metadata } = this.props;
    const dimension = ["field", fieldId, null];
    if (!_.isEqual(tag.dimension !== dimension)) {
      const field = metadata.field(dimension[1]);
      if (!field) {
        return;
      }
      setTemplateTag({
        ...tag,
        dimension,
        "widget-type": getDefaultParameterWidgetType(tag, field),
      });
    }
  }

  getFilterWidgetTypeValue = tag => {
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
    const { tag, database, databases, metadata, parameter } = this.props;
    let widgetOptions = [];
    let field = null;
    let table = null;
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
    const hasWidgetOptions = widgetOptions && widgetOptions.length > 0;
    const hasNoWidgetType =
      tag["widget-type"] === "none" || !tag["widget-type"];
    const hasNoWidgetLabel = !tag["display-name"];

    return (
      <TagContainer>
        <ContainerLabel paddingTop>{t`Variable name`}</ContainerLabel>
        <TagName>{tag.name}</TagName>

        <InputContainer>
          <ContainerLabel>{t`Variable type`}</ContainerLabel>
          <Select
            value={tag.type}
            onChange={e => this.setType(e.target.value)}
            isInitiallyOpen={!tag.type}
            placeholder={t`Select…`}
            height={300}
          >
            <Option value="text">{t`Text`}</Option>
            <Option value="number">{t`Number`}</Option>
            <Option value="date">{t`Date`}</Option>
            <Option value="dimension">{t`Field Filter`}</Option>
          </Select>
        </InputContainer>

        {tag.type === "dimension" && (
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
                      hasSelectedDimensionField ? tag.dimension[1] : null
                    }
                    setFieldFn={fieldId => this.setDimension(fieldId)}
                    className="AdminSelect flex align-center"
                    isInitiallyOpen={!tag.dimension}
                    triggerIconSize={12}
                    renderAsSelect={true}
                  />
                )}
              </Schemas.Loader>
            )}
          </InputContainer>
        )}

        {hasSelectedDimensionField && (
          <InputContainer>
            <ContainerLabel>
              {t`Filter widget type`}
              {hasNoWidgetType && <ErrorSpan>{t`(required)`}</ErrorSpan>}
            </ContainerLabel>
            <Select
              className="block"
              value={this.getFilterWidgetTypeValue(tag, widgetOptions)}
              onChange={e => this.setWidgetType(e.target.value)}
              isInitiallyOpen={!tag["widget-type"] && hasWidgetOptions}
              placeholder={t`Select…`}
            >
              {(hasWidgetOptions
                ? widgetOptions
                : [{ name: t`None`, type: "none" }]
              ).map(widgetOption => (
                <Option key={widgetOption.type} value={widgetOption.type}>
                  {widgetOption.name}
                </Option>
              ))}
            </Select>
            {!hasWidgetOptions && (
              <p>
                {t`There aren't any filter widgets for this type of field yet.`}{" "}
                <Link
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
        )}

        {(hasWidgetOptions || !isDimension) && (
          <InputContainer>
            <ContainerLabel>
              {t`Filter widget label`}
              {hasNoWidgetLabel && <ErrorSpan>{t`(required)`}</ErrorSpan>}
            </ContainerLabel>
            <InputBlurChange
              id="tag-editor-display-name"
              type="text"
              value={tag["display-name"]}
              onBlurChange={e =>
                this.setParameterAttribute("display-name", e.target.value)
              }
            />
          </InputContainer>
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

        <InputContainer lessBottomPadding>
          <ContainerLabel>{t`Required?`}</ContainerLabel>
          <Toggle
            id="tag-editor-required"
            value={tag.required}
            onChange={value => this.setRequired(value)}
          />
        </InputContainer>

        {((tag.type !== "dimension" && tag.required) ||
          tag.type === "dimension" ||
          (tag["widget-type"] && tag["widget-type"] !== "none")) && (
          <InputContainer lessBottomPadding>
            <ContainerLabel>{t`Default filter widget value`}</ContainerLabel>
            <DefaultParameterValueWidget
              parameter={
                tag.type === "text" || tag.type === "dimension"
                  ? parameter || {
                      fields: [],
                      ...tag,
                      type:
                        tag["widget-type"] ||
                        (tag.type === "date" ? "date/single" : null),
                    }
                  : {
                      fields: [],
                      hasVariableTemplateTagTarget: true,
                      type:
                        tag["widget-type"] ||
                        (tag.type === "date" ? "date/single" : null),
                    }
              }
              value={tag.default}
              setValue={value => this.setParameterAttribute("default", value)}
              isEditing
              commitImmediately
            />
          </InputContainer>
        )}
      </TagContainer>
    );
  }
}

TagEditorParam.propTypes = propTypes;

export default connect(state => ({ metadata: getMetadata(state) }), {
  fetchField,
})(TagEditorParam);
