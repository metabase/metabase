import { useCallback, useEffect } from "react";

import { setDisplayTheme } from "metabase/dashboard/actions";
import { getDisplayTheme } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { DisplayTheme } from "metabase/public/lib/types";

import type { EmbedThemeControls } from "../types";

export const useEmbedTheme = (
  themeName: DisplayTheme = "light",
): EmbedThemeControls => {
  const dispatch = useDispatch();

  const theme = useSelector(getDisplayTheme);
  const setTheme = useCallback(
    (theme: DisplayTheme) => dispatch(setDisplayTheme(theme)),
    [dispatch],
  );

  const onNightModeChange = useCallback(
    (isNightMode: boolean) => {
      setTheme(isNightMode ? "night" : "light");
    },
    [setTheme],
  );

  const isNightMode = theme === "night";

  const hasNightModeToggle = theme !== "transparent";

  useEffect(() => {
    if (themeName) {
      setTheme(themeName);
    }
  }, [themeName, setTheme]);

  return {
    theme,
    setTheme,
    onNightModeChange,
    hasNightModeToggle,
    isNightMode,
  };
};
