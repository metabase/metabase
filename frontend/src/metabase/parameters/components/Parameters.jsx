/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import querystring from "querystring";

import ParametersList from "metabase/parameters/components/ParametersList";
import { collateParametersWithValues } from "metabase/meta/Parameter";
import { getMetadata } from "metabase/selectors/metadata";
import Dimension from "metabase-lib/lib/Dimension";

import type { QueryParams } from "metabase-types/types";
import type {
  ParameterId,
  Parameter,
  ParameterValues,
  ParameterValueOrArray,
} from "metabase-types/types/Parameter";
import type { DashboardWithCards } from "metabase-types/types/Dashboard";
import type Field from "metabase-lib/lib/metadata/Field";
import type Metadata from "metabase-lib/lib/metadata/Metadata";

type Props = {
  className?: string,

  parameters: Parameter[],
  dashboard?: DashboardWithCards,
  editingParameter?: ?Parameter,
  parameterValues?: ParameterValues,

  isFullscreen?: boolean,
  isNightMode?: boolean,
  hideParameters?: ?string, // comma separated list of slugs
  isEditing?: boolean,
  isQB?: boolean,
  vertical?: boolean,
  commitImmediately?: boolean,

  metadata?: Metadata,
  query?: QueryParams,

  setParameterName?: (parameterId: ParameterId, name: string) => void,
  setParameterValue?: (parameterId: ParameterId, value: string) => void,
  setParameterDefaultValue?: (
    parameterId: ParameterId,
    defaultValue: string,
  ) => void,
  setParameterIndex?: (parameterId: ParameterId, index: number) => void,
  removeParameter?: (parameterId: ParameterId) => void,
  setEditingParameter?: (parameterId: ParameterId) => void,
};

@connect(state => ({ metadata: getMetadata(state) }))
export default class Parameters extends Component {
  props: Props;

  defaultProps = {
    syncQueryString: false,
  };

  constructor(props) {
    super(props);

    this.setParameterValuesFromQueryParamOrDefault();
  }

  setParameterValuesFromQueryParamOrDefault() {
    // sync parameters from URL query string
    const { parameters, setParameterValue, query, metadata } = this.props;
    if (setParameterValue) {
      for (const parameter of parameters) {
        const queryParam = query && query[parameter.slug];
        if (queryParam != null || parameter.default != null) {
          let value = queryParam != null ? queryParam : parameter.default;

          // ParameterValueWidget uses FieldValuesWidget if there's no available
          // date widget and all targets are fields. This matches that logic.
          const willUseFieldValuesWidget =
            parameter.hasOnlyFieldTargets && !/^date\//.test(parameter.type);
          if (willUseFieldValuesWidget && value && !Array.isArray(value)) {
            // FieldValuesWidget always produces an array. If we'll use that
            // widget, we should start with an array to match.
            value = [value];
          }
          // field IDs can be either ["field", <integer-id>, <options>] or ["field", <string-name>, <options>]
          const fieldIds = parameter.field_ids || [];
          const fields = fieldIds.map(
            id =>
              // $FlowFixMe
              metadata.field(id) || Dimension.parseMBQL(id, metadata).field(),
          );
          // $FlowFixMe
          setParameterValue(parameter.id, parseQueryParam(value, fields));
        }
      }
    }
  }

  componentDidUpdate() {
    const { parameters, parameterValues } = this.props;

    if (this.props.syncQueryString) {
      // sync parameters to URL query string
      const queryParams = {};
      for (const parameter of collateParametersWithValues(
        parameters,
        parameterValues,
      )) {
        if (parameter.value) {
          queryParams[parameter.slug] = parameter.value;
        }
      }

      let search = querystring.stringify(queryParams);
      search = search ? "?" + search : "";

      if (search !== window.location.search) {
        history.replaceState(
          null,
          document.title,
          window.location.pathname + search + window.location.hash,
        );
      }
    }
  }

  render() {
    const {
      className,

      parameters,
      dashboard,
      editingParameter,
      parameterValues,

      isFullscreen,
      isNightMode,
      hideParameters,
      isEditing,
      isQB,
      vertical,
      commitImmediately,

      setParameterName,
      setParameterValue,
      setParameterDefaultValue,
      setParameterIndex,
      removeParameter,
      setEditingParameter,
    } = this.props;

    return (
      <ParametersList
        className={className}
        parameters={parameters}
        dashboard={dashboard}
        editingParameter={editingParameter}
        parameterValues={parameterValues}
        isFullscreen={isFullscreen}
        isNightMode={isNightMode}
        hideParameters={hideParameters}
        isEditing={isEditing}
        isQB={isQB}
        vertical={vertical}
        commitImmediately={commitImmediately}
        setParameterName={setParameterName}
        setParameterValue={setParameterValue}
        setParameterDefaultValue={setParameterDefaultValue}
        setParameterIndex={setParameterIndex}
        removeParameter={removeParameter}
        setEditingParameter={setEditingParameter}
      />
    );
  }
}

export function parseQueryParam(
  value: ParameterValueOrArray,
  fields: Field[],
): any {
  if (Array.isArray(value)) {
    return value.map(v => parseQueryParam(v, fields));
  }
  // [].every is always true, so only check if there are some fields
  if (fields.length > 0) {
    // unix dates fields are numeric but query params shouldn't be parsed as numbers
    if (fields.every(f => f.isNumeric() && !f.isDate())) {
      return parseFloat(value);
    }
    if (fields.every(f => f.isBoolean())) {
      return value === "true" ? true : value === "false" ? false : value;
    }
  }
  return value;
}
