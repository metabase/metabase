/* eslint-disable react/prop-types */
import React from "react";

import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";

const MockNativeQueryEditor = ({ query, setParameterValue }) => (
  <div data-testid="mock-native-query-editor">
    <SyncedParametersList
      className="mt1"
      parameters={query.question().parameters()}
      setParameterValue={setParameterValue}
      commitImmediately
    />
  </div>
);

export default MockNativeQueryEditor;
