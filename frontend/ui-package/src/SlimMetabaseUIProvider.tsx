import type { MantineThemeOverride } from "@mantine/core";
import { useMemo } from "react";

import { getBaseThemeOverrides } from "../../src/metabase/ui/base-theme";
import "../../src/metabase/ui/components/overlays/Popover/register-popover-dropdown";
import type { ThemeProviderProps } from "../../src/metabase/ui/components/theme/ThemeProvider";
import { ThemeProviderBase } from "../../src/metabase/ui/components/theme/ThemeProvider/ThemeProviderBase";

import type { MetabaseUIProviderProps } from "./MetabaseUIProvider";
import { StandaloneUIProvider } from "./StandaloneUIProvider";

export interface SlimMetabaseUIProviderProps extends Omit<
  MetabaseUIProviderProps,
  "theme"
> {
  components?: MantineThemeOverride["components"];
}

function SlimThemeProvider(props: ThemeProviderProps) {
  return (
    <ThemeProviderBase {...props} getThemeOverrides={getBaseThemeOverrides} />
  );
}

export function SlimMetabaseUIProvider({
  components,
  ...props
}: SlimMetabaseUIProviderProps) {
  const theme = useMemo(
    () => (components ? { components } : undefined),
    [components],
  );
  return (
    <StandaloneUIProvider
      {...props}
      theme={theme}
      ThemeProvider={SlimThemeProvider}
    />
  );
}
