"use client";

import {
  MetabaseProvider,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";
import { useSearchParams } from "next/navigation";
import type { PropsWithChildren } from "react";
import { useMemo } from "react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: `http://localhost:${process.env.NEXT_PUBLIC_MB_PORT}`,
});

export const AppProvider = ({ children }: PropsWithChildren) => {
  const searchParams = useSearchParams();

  const locale = useMemo(
    () => searchParams.get("locale") ?? undefined,
    [searchParams],
  );

  return (
    <MetabaseProvider authConfig={authConfig} locale={locale}>
      {children}
    </MetabaseProvider>
  );
};
