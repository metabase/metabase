import { type ReactNode, useEffect, useState } from "react";

import { installMockSdk, uninstallMockSdk } from "../../lib/install-mock-sdk";

export type MetabaseTestProviderProps = {
  children?: ReactNode;
};

export const MetabaseTestProvider = ({
  children,
}: MetabaseTestProviderProps) => {
  useState(installMockSdk);

  useEffect(() => {
    installMockSdk();

    return uninstallMockSdk;
  }, []);

  return children;
};
