/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import querystring from "querystring";

import ParametersList from "metabase/parameters/components/ParametersList";
import { syncQueryParamsWithURL } from "./syncQueryParamsWithURL";
import {
  getParameterValuesBySlug,
  removeUndefaultedNilValuedPairs,
} from "metabase/meta/Parameter";
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
    const { parameters, parameterValues, dashboard } = this.props;

    if (this.props.syncQueryString) {
      // sync parameters to URL query string
      const parameterValuesBySlug = getParameterValuesBySlug(
        parameters,
        parameterValues,
        dashboard && removeUndefaultedNilValuedPairs,
      );

      let search = querystring.stringify(parameterValuesBySlug);
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
