/* @flow */

import React, { Component } from "react";

import StaticParameterWidget from "./ParameterWidget.jsx";
import Icon from "metabase/components/Icon";
import colors from "metabase/lib/colors";

import querystring from "querystring";
import cx from "classnames";

import type { QueryParams } from "metabase/meta/types";
import type {
  ParameterId,
  Parameter,
  ParameterValues,
} from "metabase/meta/types/Parameter";

type Props = {
  className?: string,

  parameters: Parameter[],
  editingParameter?: ?Parameter,
  parameterValues?: ParameterValues,

  isFullscreen?: boolean,
  isNightMode?: boolean,
  isEditing?: boolean,
  isQB?: boolean,
  vertical?: boolean,
  commitImmediately?: boolean,

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

export default class Parameters extends Component {
  props: Props;

  defaultProps = {
    syncQueryString: false,
    vertical: false,
    commitImmediately: false,
  };

  componentWillMount() {
    // sync parameters from URL query string
    const { parameters, setParameterValue, query } = this.props;
    if (setParameterValue) {
      for (const parameter of parameters) {
        if (query && query[parameter.slug] != null) {
          setParameterValue(parameter.id, query[parameter.slug]);
        } else if (parameter.default != null) {
          setParameterValue(parameter.id, parameter.default);
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
      isQB,
      setParameterName,
      setParameterValue,
      setParameterDefaultValue,
      setParameterIndex,
      removeParameter,
      vertical,
      commitImmediately,
    } = this.props;

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
        {parameters.map((parameter, index) => (
          <ParameterWidget
            key={parameter.id}
            index={index}
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
            setName={
              setParameterName && (name => setParameterName(parameter.id, name))
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
      color: colors["border"],
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
