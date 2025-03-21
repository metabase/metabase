// [<snippet example>]
"use client";

import {
  MetabaseProvider,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: process.env.NEXT_PUBLIC_METABASE_INSTANCE_URL,
  authProviderUri: process.env.NEXT_PUBLIC_METABASE_AUTH_PROVIDER_URI,
});

export const EmbeddingSdkProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <MetabaseProvider authConfig={authConfig}>{children}</MetabaseProvider>
  );
};
// [<endsnippet example>]

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface ProcessEnv {
      readonly NEXT_PUBLIC_METABASE_INSTANCE_URL: string;
      readonly NEXT_PUBLIC_METABASE_AUTH_PROVIDER_URI: string;
    }
  }
}
