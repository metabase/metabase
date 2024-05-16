import { setDisplayTheme } from "metabase/dashboard/actions";
import { getDisplayTheme } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { DisplayTheme } from "metabase/public/lib/types";

export type DashboardThemeControls = {
  theme: DisplayTheme | null;
  setTheme: (theme: DisplayTheme | null) => void;
  hasNightModeToggle: boolean;
  onNightModeChange: (isNightMode: boolean) => void;
  isNightMode: boolean;
};

export const useDashboardTheme = (): DashboardThemeControls => {
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
