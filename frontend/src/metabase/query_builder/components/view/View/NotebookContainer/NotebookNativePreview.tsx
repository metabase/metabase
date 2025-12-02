import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { setUIControls, updateQuestion } from "metabase/query_builder/actions";
import { getQuestion } from "metabase/query_builder/selectors";
import { NotebookNativePreview as ControlledNotebookNativePreview } from "metabase/querying/notebook/components/NotebookNativePreview";
import type Question from "metabase-lib/v1/Question";

export const NotebookNativePreview = () => {
  const dispatch = useDispatch();
  const question = checkNotNull(useSelector(getQuestion));

  const handleConvertClick = useCallback(
    (newQuestion: Question) => {
      dispatch(
        updateQuestion(newQuestion, { shouldUpdateUrl: true, run: true }),
      );
      dispatch(setUIControls({ isNativeEditorOpen: true }));
    },
    [dispatch],
  );

  return (
    <ControlledNotebookNativePreview
      question={question}
      onConvertClick={handleConvertClick}
    />
  );
};
