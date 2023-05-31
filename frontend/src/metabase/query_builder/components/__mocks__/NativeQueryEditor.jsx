/* eslint-disable react/prop-types */
import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";
import { ACE_ELEMENT_ID } from "metabase/query_builder/components/NativeQueryEditor/constants";

const MockNativeQueryEditor = ({ query, setParameterValue, ...props }) => {
  const onChange = evt => {
    props.setDatasetQuery(query.setQueryText(evt.target.value));
  };

  return (
    <div data-testid="mock-native-query-editor" id={ACE_ELEMENT_ID}>
      {query.queryText && (
        <textarea value={query.queryText()} onChange={onChange} />
      )}
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
