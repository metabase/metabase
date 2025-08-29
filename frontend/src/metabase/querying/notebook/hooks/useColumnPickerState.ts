import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  onOpenColumnPicker,
  onCloseColumnPicker,
} from "metabase/query_builder/actions/ui";
import {
  getIsShowingColumnPickerSidebar,
  getActiveColumnPickerStepId,
} from "metabase/query_builder/selectors";

export const useColumnPickerState = () => {
  const dispatch = useDispatch();
  const isShowingColumnPickerSidebar = useSelector(
    getIsShowingColumnPickerSidebar,
  );
  const activeColumnPickerStepId = useSelector(getActiveColumnPickerStepId);

  const openColumnPicker = useCallback(
    (id: string) => {
      console.log("open column picker");
      dispatch(onOpenColumnPicker(id));
    },
    [dispatch],
  );

  const closeColumnPicker = useCallback(
    (_id: string) => {
      console.log("close column picker");
      dispatch(onCloseColumnPicker());
    },
    [dispatch],
  );

  const isColumnPickerOpen = useCallback(
    (id: string) => {
      return isShowingColumnPickerSidebar && activeColumnPickerStepId === id;
    },
    [isShowingColumnPickerSidebar, activeColumnPickerStepId],
  );

  return {
    openColumnPicker,
    closeColumnPicker,
    isColumnPickerOpen,
  };
};
