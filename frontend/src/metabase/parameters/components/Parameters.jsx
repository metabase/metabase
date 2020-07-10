/* @flow */

import React, { Component } from "react";
import { connect } from "react-redux";

import StaticParameterWidget from "./ParameterWidget";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

import { getMetadata } from "metabase/selectors/metadata";

import querystring from "querystring";
import cx from "classnames";

import type { QueryParams } from "metabase-types/types";
import type {
  ParameterId,
  Parameter,
  ParameterValues,
  ParameterValueOrArray,
} from "metabase-types/types/Parameter";

import type { DashboardWithCards } from "metabase-types/types/Dashboard";
import Dimension from "metabase-lib/lib/Dimension";
import type Field from "metabase-lib/lib/metadata/Field";
import type Metadata from "metabase-lib/lib/metadata/Metadata";

type Props = {
  className?: string,

  parameters: Parameter[],
  editingParameter?: ?Parameter,
  parameterValues?: ParameterValues,

  isFullscreen?: boolean,
  isNightMode?: boolean,
  hideParameters?: ?string, // comma separated list of slugs
  isEditing?: false | DashboardWithCards,
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
    vertical: false,
    commitImmediately: false,
  };

  componentWillMount() {
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
          // field IDs can be either ["field-id", <id>] or ["field-literal", <name>, <type>]
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
    if (this.props.syncQueryString) {
      // sync parameters to URL query string
      const queryParams = {};
      for (const parameter of this._parametersWithValues()) {
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

  _parametersWithValues() {
    const { parameters, parameterValues } = this.props;
    if (parameterValues) {
      return parameters.map(p => ({
        ...p,
        value: parameterValues[p.id],
      }));
    } else {
      return parameters;
    }
  }

  handleSortEnd = ({
    oldIndex,
    newIndex,
  }: {
    oldIndex: number,
    newIndex: number,
  }) => {
    const { parameters, setParameterIndex } = this.props;
    if (setParameterIndex) {
      setParameterIndex(parameters[oldIndex].id, newIndex);
    }
  };

  render() {
    const {
      className,
      editingParameter,
      setEditingParameter,
      isEditing,
      isFullscreen,
      isNightMode,
      hideParameters,
      isQB,
      setParameterName,
      setParameterValue,
      setParameterDefaultValue,
      setParameterIndex,
      removeParameter,
      vertical,
      commitImmediately,
    } = this.props;

    const hiddenParameters = new Set((hideParameters || "").split(","));

    const parameters = this._parametersWithValues();

    let ParameterWidget;
    let ParameterWidgetList;
    if (isEditing) {
      ParameterWidget = SortableParameterWidget;
      ParameterWidgetList = SortableParameterWidgetList;
    } else {
      ParameterWidget = StaticParameterWidget;
      ParameterWidgetList = StaticParameterWidgetList;
    }

    return (
      <ParameterWidgetList
        className={cx(
          className,
          "flex align-end flex-wrap",
          vertical ? "flex-column" : "flex-row",
          { mt1: isQB },
        )}
        axis="x"
        distance={9}
        onSortEnd={this.handleSortEnd}
      >
        {parameters
          .filter(p => !hiddenParameters.has(p.slug))
          .map((parameter, index) => (
            <ParameterWidget
              key={parameter.id}
              className={cx("relative hover-parent hover--visibility", {
                mb2: vertical,
              })}
              isEditing={isEditing}
              isFullscreen={isFullscreen}
              isNightMode={isNightMode}
              parameter={parameter}
              parameters={parameters}
              editingParameter={editingParameter}
              setEditingParameter={setEditingParameter}
              index={index}
              setName={
                setParameterName &&
                (name => setParameterName(parameter.id, name))
              }
              setValue={
                setParameterValue &&
                (value => setParameterValue(parameter.id, value))
              }
              setDefaultValue={
                setParameterDefaultValue &&
                (value => setParameterDefaultValue(parameter.id, value))
              }
              remove={removeParameter && (() => removeParameter(parameter.id))}
              commitImmediately={commitImmediately}
            >
              {/* show drag handle if editing and setParameterIndex provided */}
              {isEditing && setParameterIndex ? (
                <SortableParameterHandle />
              ) : null}
            </ParameterWidget>
          ))}
      </ParameterWidgetList>
    );
  }
}
import {
  SortableContainer,
  SortableElement,
  SortableHandle,
} from "react-sortable-hoc";

const StaticParameterWidgetList = ({ children, ...props }) => {
  return <div {...props}>{children}</div>;
};

const SortableParameterHandle = SortableHandle(() => (
  <div
    className="absolute top bottom left flex layout-centered hover-child cursor-grab"
    style={{
      color: color("border"),
      // width should match the left padding of the ParameterWidget container class so that it's centered
      width: "1em",
      marginLeft: "1px",
    }}
  >
    <Icon name="grabber2" size={12} />
  </div>
));

const SortableParameterWidget = SortableElement(StaticParameterWidget);
const SortableParameterWidgetList = SortableContainer(
  StaticParameterWidgetList,
);

export function parseQueryParam(
  value: ParameterValueOrArray,
  fields: Field[],
): any {
  if (Array.isArray(value)) {
    return value.map(v => parseQueryParam(v, fields));
  }
  // [].every is always true, so only check if there are some fields
  if (fields.length > 0) {
    if (fields.every(f => f.isNumeric())) {
      return parseFloat(value);
    }
    if (fields.every(f => f.isBoolean())) {
      return value === "true" ? true : value === "false" ? false : value;
    }
  }
  return value;
}
