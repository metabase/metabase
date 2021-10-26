/* eslint-disable react/prop-types */
import React from "react";

import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";

const MockNativeQueryEditor = ({ location, query, setParameterValue }) => (
  <SyncedParametersList
    parameters={query.question().parameters()}
    query={location.query}
    setParameterValue={setParameterValue}
    isQB
    commitImmediately
  />
);
export default MockNativeQueryEditor;
