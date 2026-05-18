/* eslint-disable react/prop-types */
export const NativeQueryEditor = ({ query, setDatasetQuery }) => {
  const onChange = (evt) => {
    setDatasetQuery(query.setQueryText(evt.target.value));
  };

  return (
    <div data-testid="mock-native-query-editor">
      {query.queryText && (
        <textarea value={query.queryText()} onChange={onChange} />
      )}
    </div>
  );
};
