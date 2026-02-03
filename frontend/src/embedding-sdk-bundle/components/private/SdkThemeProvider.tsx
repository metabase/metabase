// eslint-disable-next-line no-restricted-imports -- We sometimes need css-in-js in the SDK
import { Global } from "@emotion/react";
import { useContext, useId, useMemo } from "react";

import { DEFAULT_FONT } from "embedding-sdk-bundle/config";
import { useEmbeddingThemeOverride } from "embedding-sdk-bundle/hooks/private/use-embedding-theme-override";
import { EnsureSingleInstance } from "embedding-sdk-shared/components/EnsureSingleInstance/EnsureSingleInstance";
import { useSetting } from "metabase/common/hooks";
import type { MetabaseEmbeddingTheme } from "metabase/embedding-sdk/theme";
import { useSelector } from "metabase/lib/redux";
import { getFont } from "metabase/styled-components/selectors";
import { getMetabaseSdkCssVariables } from "metabase/styled-components/theme/css-variables";
import { ThemeProvider, useMantineTheme } from "metabase/ui";
import { ThemeProviderContext } from "metabase/ui/components/theme/ThemeProvider/context";

interface Props {
  theme?: MetabaseEmbeddingTheme;
  children: React.ReactNode;
}

export const SdkThemeProvider = ({ theme, children }: Props) => {
  const themeOverride = useEmbeddingThemeOverride(theme);

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
  const whitelabelColors = useSetting("application-colors");

  // the default is needed for when the sdk can't connect to the instance and get the default from there
  const font = useSelector(getFont) ?? DEFAULT_FONT;

  const styles = useMemo(() => {
    return getMetabaseSdkCssVariables({ theme, font, whitelabelColors });
  }, [theme, font, whitelabelColors]);

  return <Global styles={styles} />;
}
