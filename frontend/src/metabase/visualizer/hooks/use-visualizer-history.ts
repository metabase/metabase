import { useDispatch, useSelector } from "metabase/lib/redux";

import { getCanRedo, getCanUndo } from "../selectors";
import { redo, undo } from "../visualizer.slice";

export function useVisualizerHistory() {
  const dispatch = useDispatch();
  return {
    canUndo: useSelector(getCanUndo),
    canRedo: useSelector(getCanRedo),
    undo: () => dispatch(undo()),
    redo: () => dispatch(redo()),
  };
}
