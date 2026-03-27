import CS from "metabase/css/core/index.css";
import { setUIControls } from "metabase/query_builder/actions";
import { getUiControls } from "metabase/query_builder/selectors";
import { useDispatch, useSelector } from "metabase/utils/redux";

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
