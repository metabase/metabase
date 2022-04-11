/* eslint-disable react/prop-types */
import React from "react";

import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";

const MockNativeQueryEditor = ({ location, query, setParameterValue }) => (
  <SyncedParametersList
    className="mt1"
    parameters={query.question().parameters()}
    setParameterValue={setParameterValue}
    commitImmediately
  />
);
export default MockNativeQueryEditor;
