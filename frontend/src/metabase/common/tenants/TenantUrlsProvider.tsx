import { type ReactNode, createContext, useContext, useMemo } from "react";

import {
  type TenantUrls,
  adminTenantUrls,
  createTenantUrls,
} from "./tenant-urls";

// Defaults to admin: admin People's own list has no provider above it.
const TenantUrlsContext = createContext<TenantUrls>(adminTenantUrls);

type TenantUrlsProviderProps = {
  basePath: string;
  children: ReactNode;
};

export function TenantUrlsProvider({
  basePath,
  children,
}: TenantUrlsProviderProps) {
  const urls = useMemo(() => createTenantUrls(basePath), [basePath]);

  return (
    <TenantUrlsContext.Provider value={urls}>
      {children}
    </TenantUrlsContext.Provider>
  );
}

export function useTenantUrls() {
  return useContext(TenantUrlsContext);
}
