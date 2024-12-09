import type React from "react";
import { createContext, useContext } from "react";

const SdkContext = createContext<boolean>(false);

export const SdkContextProvider = ({ children }: React.PropsWithChildren) => {
  return <SdkContext.Provider value={true}>{children}</SdkContext.Provider>;
};

export const useIsInSdkProvider = () => {
  return useContext(SdkContext);
};
