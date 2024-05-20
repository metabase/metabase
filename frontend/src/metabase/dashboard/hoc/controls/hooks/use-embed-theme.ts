import { setDisplayTheme } from "metabase/dashboard/actions";
import type { EmbedThemeControls } from "metabase/dashboard/hoc/controls/types";
import { getDisplayTheme } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { DisplayTheme } from "metabase/public/lib/types";

export const useEmbedTheme = (): EmbedThemeControls => {
  const dispatch = useDispatch();

  const theme = useSelector(getDisplayTheme);
  const setTheme = (theme: DisplayTheme | null) =>
    dispatch(setDisplayTheme(theme));

  const onNightModeChange = (isNightMode: boolean) => {
    setTheme(isNightMode ? "night" : null);
  };

  const isNightMode = theme === "night";

  const hasNightModeToggle = theme !== "transparent";

  return {
    theme,
    setTheme,
    onNightModeChange,
    hasNightModeToggle,
    isNightMode,
  };
};
