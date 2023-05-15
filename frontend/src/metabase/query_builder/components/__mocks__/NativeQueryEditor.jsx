/* eslint-disable react/prop-types */
import React from "react";

import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";

const MockNativeQueryEditor = ({ query, setParameterValue, ...props }) => {
  const onChange = evt => {
    props.setDatasetQuery(query.setQueryText(evt.target.value));
  };

  return (
    <div data-testid="mock-native-query-editor">
      <textarea value={query.queryText()} onChange={onChange} />
      <SyncedParametersList
        className="mt1"
        parameters={query.question().parameters()}
        setParameterValue={setParameterValue}
        commitImmediately
      />
    </div>
  );
};

export default MockNativeQueryEditor;
