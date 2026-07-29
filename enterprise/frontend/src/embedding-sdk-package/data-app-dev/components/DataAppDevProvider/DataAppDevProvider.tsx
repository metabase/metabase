import { once } from "underscore";

import type { MetabaseProviderProps } from "embedding-sdk-bundle/types/metabase-provider";
import { MetabaseProvider } from "embedding-sdk-package/components/public/MetabaseProvider/MetabaseProvider";
import { SdkThemeProviderWithStore } from "embedding-sdk-package/data-app-dev/components/SdkThemeProviderWithStore/SdkThemeProviderWithStore";
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
      <SdkThemeProviderWithStore theme={props.theme}>
        {children}
      </SdkThemeProviderWithStore>
    </MetabaseProvider>
  );
};
