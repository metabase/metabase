import { Global } from "@emotion/react";
import { useContext, useId, useMemo } from "react";

import { DEFAULT_FONT } from "embedding-sdk-bundle/config";
import { getEmbeddingThemeOverride } from "embedding-sdk-bundle/lib/theme";
import type { MetabaseThemeV1 } from "embedding-sdk-bundle/types/ui";
import { EnsureSingleInstance } from "embedding-sdk-shared/components/EnsureSingleInstance/EnsureSingleInstance";
import { setGlobalEmbeddingColors } from "metabase/embedding-sdk/theme/embedding-color-palette";
import type { MetabaseThemeV2 } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import { getSettings } from "metabase/selectors/settings";
import { getFont } from "metabase/styled-components/selectors";
import { getMetabaseSdkCssVariables } from "metabase/styled-components/theme/css-variables";
import { ThemeProvider, useMantineTheme } from "metabase/ui";
import { ThemeProviderContext } from "metabase/ui/components/theme/ThemeProvider/context";
import { getApplicationColors } from "metabase-enterprise/settings/selectors";

interface Props {
  theme?: MetabaseThemeV1 | MetabaseThemeV2;
  children: React.ReactNode;
}

export const SdkThemeProvider = ({ theme, children }: Props) => {
  const font = useSelector(getFont);
  const appColors = useSelector((state) =>
    getApplicationColors(getSettings(state)),
  );

  const themeOverride = useMemo(() => {
    // Does not apply to the new theme system.
    if (theme && theme.version === 2) {
      return;
    }

    // !! Mutate the global colors object to apply the new colors.
    // This must be done before ThemeProvider calls getThemeOverrides.
    setGlobalEmbeddingColors(theme?.colors, appColors ?? {});

    return getEmbeddingThemeOverride(theme || {}, font);
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
          <ThemeProvider
            theme={theme?.version === 2 ? theme : undefined}
            themeOverride={themeOverride}
          >
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
