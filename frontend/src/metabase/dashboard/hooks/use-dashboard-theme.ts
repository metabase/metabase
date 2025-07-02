import { useCallback, useEffect } from "react";

import { setDisplayTheme } from "metabase/dashboard/actions";
import { getDisplayTheme } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { DisplayTheme } from "metabase/public/lib/types";

import type { EmbedThemeControls } from "../types";

export const useDashboardTheme = (
  initTheme: DisplayTheme,
): EmbedThemeControls => {
  const dispatch = useDispatch();

  const theme = useSelector(getDisplayTheme);
  const setTheme = useCallback(
    (theme: DisplayTheme) => dispatch(setDisplayTheme(theme)),
    [dispatch],
  );

  useEffect(() => {
    if (initTheme) {
      setTheme(initTheme);
    }
  }, [initTheme, setTheme]);

  const onNightModeChange = useCallback(
    (isNightMode: boolean) => {
      setTheme(isNightMode ? "night" : "light");
    },
    [setTheme],
  );

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
