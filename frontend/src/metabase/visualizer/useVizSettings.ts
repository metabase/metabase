import { useDispatch, useSelector } from "metabase/lib/redux";

import {
  getVizSettingsDisplay,
  openVizSettings,
  closeVizSettings,
} from "./store";

export function useVizSettings() {
  const isVizSettingsOpen = useSelector(getVizSettingsDisplay);

  const dispatch = useDispatch();

  dispatch(openVizSettings);
  return {
    isVizSettingsOpen,
    openVizSettings: () => dispatch(openVizSettings()),
    closeVizSettings: () => dispatch(closeVizSettings()),
  };
}
