import CS from "metabase/css/core/index.css";
import { getUiControls } from "metabase/query_builder/selectors";
import { useDispatch, useSelector } from "metabase/redux";
import { setUIControls } from "metabase/redux/query-builder";

import { QuestionDisplayToggle } from "../QuestionDisplayToggle/QuestionDisplayToggle";

export const CenterViewFooterButtonGroup = () => {
  const dispatch = useDispatch();
  const { isShowingRawTable } = useSelector(getUiControls);
  return (
    <QuestionDisplayToggle
      className={CS.mx1}
      isShowingRawTable={isShowingRawTable}
      onToggleRawTable={(isShowingRawTable) => {
        dispatch(setUIControls({ isShowingRawTable }));
      }}
    />
  );
};
