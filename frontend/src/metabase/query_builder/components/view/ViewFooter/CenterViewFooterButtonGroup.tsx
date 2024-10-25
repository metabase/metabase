import { EditorViewControl } from "embedding-sdk/components/private/EditorViewControl";
import CS from "metabase/css/core/index.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import { getQuestion, getUiControls } from "metabase/query_builder/selectors";

import QuestionDisplayToggle from "../QuestionDisplayToggle";

export const CenterViewFooterButtonGroup = () => {
  const dispatch = useDispatch();
  const question = useSelector(getQuestion);
  const { queryBuilderView } = useSelector(getUiControls);
  return (
    <>
      {question && (
        <QuestionDisplayToggle
          className={CS.mx1}
          question={question}
          isShowingRawTable={queryBuilderView === "table"}
          onToggleRawTable={isShowingRawTable => {
            dispatch(
              setUIControls({
                isShowingRawTable,
                queryBuilderView: "table",
              }),
            );
          }}
        />
      )}
      <EditorViewControl
        value={queryBuilderView}
        onChange={queryBuilderView =>
          dispatch(setUIControls({ queryBuilderView }))
        }
      />
    </>
  );
};
