import { Global } from "@emotion/react";
import { useMemo } from "react";

import type { MetabaseTheme } from "embedding-sdk";
import { DEFAULT_FONT } from "embedding-sdk/config";
import { getEmbeddingThemeOverride } from "embedding-sdk/lib/theme";
import { setGlobalEmbeddingColors } from "metabase/embedding-sdk/theme/embedding-color-palette";
import { useSelector } from "metabase/lib/redux";
import { getSettings } from "metabase/selectors/settings";
import { getFont } from "metabase/styled-components/selectors";
import { getMetabaseSdkCssVariables } from "metabase/styled-components/theme/css-variables";
import { ThemeProvider, useMantineTheme } from "metabase/ui";
import { getApplicationColors } from "metabase-enterprise/settings/selectors";

interface Props {
  theme?: MetabaseTheme;
  children: React.ReactNode;
}

export const SdkThemeProvider = ({ theme, children }: Props) => {
  const font = useSelector(getFont);
  const appColors = useSelector(state =>
    getApplicationColors(getSettings(state)),
  );

  const themeOverride = useMemo(() => {
    // !! Mutate the global colors object to apply the new colors.
    // This must be done before ThemeProvider calls getThemeOverrides.
    setGlobalEmbeddingColors(theme?.colors, appColors);

    return getEmbeddingThemeOverride(theme || {}, font);
  }, [appColors, theme, font]);

  return (
    <ThemeProvider theme={themeOverride}>
      <GlobalSdkCssVariables />
      {children}
    </ThemeProvider>
  );
};

function GlobalSdkCssVariables() {
  const theme = useMantineTheme();

  // the default is needed for when the sdk can't connect to the instance and get the default from there
  const font = useSelector(getFont) ?? DEFAULT_FONT;

  return <Global styles={getMetabaseSdkCssVariables(theme, font)} />;
}
