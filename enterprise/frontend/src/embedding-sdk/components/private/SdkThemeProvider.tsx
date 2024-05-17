import { useMemo } from "react";

import type { MetabaseTheme } from "embedding-sdk";
import {
  getEmbeddingThemeOverride,
  setGlobalEmbeddingColors,
} from "embedding-sdk/lib/theme";
import { useSelector } from "metabase/lib/redux";
import { getSettings } from "metabase/selectors/settings";
import { ThemeProvider } from "metabase/ui";
import { getApplicationColors } from "metabase-enterprise/settings/selectors";

interface Props {
  theme?: MetabaseTheme;
  children: React.ReactNode;
}

export const SdkThemeProvider = ({ theme, children }: Props) => {
  const appColors = useSelector(state =>
    getApplicationColors(getSettings(state)),
  );

  const themeOverride = useMemo(() => {
    // !! Mutate the global colors object to apply the new colors.
    // This must be done before ThemeProvider calls getThemeOverrides.
    setGlobalEmbeddingColors(theme?.colors, appColors);

    return theme && getEmbeddingThemeOverride(theme);
  }, [appColors, theme]);

  return <ThemeProvider theme={themeOverride}>{children}</ThemeProvider>;
};
