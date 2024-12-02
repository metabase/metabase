import type React from "react";
import type { ReactNode } from "react";
import { createContext, useContext } from "react";

const SdkContext = createContext<boolean>(false);

export const SdkContextProvider = ({ children }: React.PropsWithChildren) => {
  return <SdkContext.Provider value={true}>{children}</SdkContext.Provider>;
};

export const useIsInSdkProvider = () => {
  return useContext(SdkContext);
};

export const AbortIfNotInSdkProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const contextValue = useContext(SdkContext);
  return contextValue ? <>{children}</> : null;
};
