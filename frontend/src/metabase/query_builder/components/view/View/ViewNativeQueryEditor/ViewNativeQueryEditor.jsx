/* eslint-disable react/prop-types */
import { useSelector } from "metabase/lib/redux";
import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import { getHighlightedNativeQueryLineNumbers } from "metabase/query_builder/selectors";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";

import NativeQueryEditorS from "./ViewNativeQueryEditor.module.css";

export const ViewNativeQueryEditor = (props) => {
  const {
    question,
    height,
    isDirty,
    isNativeEditorOpen,
    card,
    setParameterValueToDefault,
    onSetDatabaseId,
  } = props;

  const legacyNativeQuery = question.legacyNativeQuery();
  const highlightedLineNumbers = useSelector(
    getHighlightedNativeQueryLineNumbers,
  );

  // Normally, when users open native models,
  // they open an ad-hoc GUI question using the model as a data source
  // (using the `/dataset` endpoint instead of the `/card/:id/query`)
  // However, users without data permission open a real model as they can't use the `/dataset` endpoint
  // So the model is opened as an underlying native question and the query editor becomes visible
  // This check makes it hide the editor in this particular case
  // More details: https://github.com/metabase/metabase/pull/20161
  const { isEditable } = Lib.queryDisplayInfo(question.query());
  if (question.type() === "model" && !isEditable) {
    return null;
  }

  return (
    <Box className={NativeQueryEditorS.NativeQueryEditorContainer}>
      <NativeQueryEditor
        {...props}
        query={legacyNativeQuery}
        viewHeight={height}
        highlightedLineNumbers={highlightedLineNumbers}
        isOpen={legacyNativeQuery.isEmpty() || isDirty}
        isInitiallyOpen={isNativeEditorOpen}
        datasetQuery={card && card.dataset_query}
        setParameterValueToDefault={setParameterValueToDefault}
        onSetDatabaseId={onSetDatabaseId}
      />
    </Box>
  );
};
