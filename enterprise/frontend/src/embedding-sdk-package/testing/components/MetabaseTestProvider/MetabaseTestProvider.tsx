import { type ReactNode, useEffect, useState } from "react";

import { acquireMockSdk, installMockSdk } from "../../lib/install-mock-sdk";

export type MetabaseTestProviderProps = {
  children?: ReactNode;
};

export const MetabaseTestProvider = ({
  children,
}: MetabaseTestProviderProps) => {
  useState(installMockSdk);

  useEffect(acquireMockSdk, []);

  return children;
};
