/* eslint-disable react/prop-types */
import React from "react";

import Parameters from "metabase/parameters/components/Parameters/Parameters";

const MockNativeQueryEditor = ({ location, query, setParameterValue }) => (
  <Parameters
    parameters={query.question().parameters()}
    query={location.query}
    setParameterValue={setParameterValue}
    syncQueryString
    isQB
    commitImmediately
  />
);
export default MockNativeQueryEditor;
