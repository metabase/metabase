/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import querystring from "querystring";

import ParametersList from "metabase/parameters/components/ParametersList";
import { syncQueryParamsWithURL } from "./syncQueryParamsWithURL";
import { collateParametersWithValues } from "metabase/meta/Parameter";
import { getMetadata } from "metabase/selectors/metadata";

@connect(state => ({ metadata: getMetadata(state) }))
export default class Parameters extends Component {
  defaultProps = {
    syncQueryString: false,
  };

  constructor(props) {
    super(props);

    syncQueryParamsWithURL(props);
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
