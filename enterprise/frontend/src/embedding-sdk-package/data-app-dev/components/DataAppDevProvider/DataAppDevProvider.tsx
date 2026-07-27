import { once } from "underscore";

import type { MetabaseProviderProps } from "embedding-sdk-bundle/types/metabase-provider";
import { SdkThemeProvider } from "embedding-sdk-package/components/private/SdkThemeProvider/SdkThemeProvider";
import { MetabaseProvider } from "embedding-sdk-package/components/public/MetabaseProvider/MetabaseProvider";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";

const registerDataAppDevContext = once((appSlug: string) => {
  ensureMetabaseProviderPropsStore().updateInternalProps({
    dataApp: { name: appSlug, isDev: true },
  });
});

export type DataAppDevProviderProps = MetabaseProviderProps & {
  appSlug: string;
};

export const DataAppDevProvider = ({
  appSlug,
  children,
  ...props
}: DataAppDevProviderProps) => {
  registerDataAppDevContext(appSlug);

  return (
    <MetabaseProvider {...props}>
      <SdkThemeProvider theme={props.theme}>{children}</SdkThemeProvider>
    </MetabaseProvider>
  );
};
