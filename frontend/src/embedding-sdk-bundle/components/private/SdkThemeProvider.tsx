// eslint-disable-next-line no-restricted-imports -- We sometimes need css-in-js in the SDK
import { Global } from "@emotion/react";
import { useContext, useId, useMemo } from "react";

import { DEFAULT_FONT } from "embedding-sdk-bundle/config";
import { getEmbeddingThemeOverride } from "embedding-sdk-bundle/lib/theme";
import type { MetabaseTheme } from "embedding-sdk-bundle/types/ui";
import { EnsureSingleInstance } from "embedding-sdk-shared/components/EnsureSingleInstance/EnsureSingleInstance";
import { applyThemePreset } from "embedding-sdk-shared/lib/apply-theme-preset";
import { useSetting } from "metabase/common/hooks";
import { setGlobalEmbeddingColors } from "metabase/embedding-sdk/theme/embedding-color-palette";
import { useSelector } from "metabase/lib/redux";
import { getFont } from "metabase/styled-components/selectors";
import { getMetabaseSdkCssVariables } from "metabase/styled-components/theme/css-variables";
import { ThemeProvider, useMantineTheme } from "metabase/ui";
import { ThemeProviderContext } from "metabase/ui/components/theme/ThemeProvider/context";

interface Props {
  theme?: MetabaseTheme;
  children: React.ReactNode;
}

export const SdkThemeProvider = ({ theme, children }: Props) => {
  const font = useSelector(getFont);
  const appColors = useSetting("application-colors");

  const themeOverride = useMemo(() => {
    const themeWithPreset = applyThemePreset(theme);

    // !! Mutate the global colors object to apply the new colors.
    // This must be done before ThemeProvider calls getThemeOverrides.
    setGlobalEmbeddingColors(themeWithPreset?.colors, appColors ?? {});

    return getEmbeddingThemeOverride(themeWithPreset || {}, font);
  }, [appColors, theme, font]);

  const { withCssVariables, withGlobalClasses } =
    useContext(ThemeProviderContext);

  const ensureSingleInstanceId = useId();

  return (
    <EnsureSingleInstance
      groupId="sdk-theme-provider"
      instanceId={ensureSingleInstanceId}
    >
      {({ isInstanceToRender }) => (
        <ThemeProviderContext.Provider
          value={{
            withCssVariables: withCssVariables ?? isInstanceToRender,
            withGlobalClasses: withGlobalClasses ?? isInstanceToRender,
          }}
        >
          <ThemeProvider theme={themeOverride}>
            {isInstanceToRender && <GlobalSdkCssVariables />}

            {children}
          </ThemeProvider>
        </ThemeProviderContext.Provider>
      )}
    </EnsureSingleInstance>
  );
};

function GlobalSdkCssVariables() {
  const theme = useMantineTheme();

  // the default is needed for when the sdk can't connect to the instance and get the default from there
  const font = useSelector(getFont) ?? DEFAULT_FONT;

  const styles = useMemo(
    () => getMetabaseSdkCssVariables(theme, font),
    [theme, font],
  );

  return <Global styles={styles} />;
}
