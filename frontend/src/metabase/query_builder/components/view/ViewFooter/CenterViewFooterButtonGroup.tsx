import { useCallback } from "react";

import CS from "metabase/css/core/index.css";
import { useDispatch, useSelector } from "metabase/redux";
import { setUIControls } from "metabase/redux/query-builder";

import { getUiControls } from "../../../store/selectors";
import { QuestionDisplayToggle } from "../QuestionDisplayToggle/QuestionDisplayToggle";

export const CenterViewFooterButtonGroup = () => {
  const dispatch = useDispatch();
  const { isShowingRawTable } = useSelector(getUiControls);
  const handleToggleRawTable = useCallback(
    (isShowingRawTable: boolean) => {
      dispatch(setUIControls({ isShowingRawTable }));
    },
    [dispatch],
  );

  return (
    <QuestionDisplayToggle
      className={CS.mx1}
      isShowingRawTable={isShowingRawTable}
      onToggleRawTable={handleToggleRawTable}
    />
  );
};
