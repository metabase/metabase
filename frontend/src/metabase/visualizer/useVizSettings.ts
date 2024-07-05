import { useDispatch, useSelector } from "metabase/lib/redux";

import {
  getVizSettingsDisplay,
  openVizSettings,
  closeVizSettings,
  toggleVizSettings,
} from "./store";

export function useVizSettings() {
  const isVizSettingsOpen = useSelector(getVizSettingsDisplay);

  const dispatch = useDispatch();

  dispatch(openVizSettings);
  return {
    isVizSettingsOpen,
    toggleVizSettings: () => dispatch(toggleVizSettings()),
    openVizSettings: () => dispatch(openVizSettings()),
    closeVizSettings: () => dispatch(closeVizSettings()),
  };
}
