/* eslint-disable */
import React, { useContext, createContext, useMemo, ReactNode } from "react";

import useLoadGsiScript, {
  UseLoadGsiScriptOptions,
} from "./hooks/useLoadGsiScript";

interface GoogleOAuthContextProps {
  clientId: string;
  scriptLoadedSuccessfully: boolean;
}

const GoogleOAuthContext = createContext<GoogleOAuthContextProps>(null!);

interface GoogleOAuthProviderProps extends UseLoadGsiScriptOptions {
  clientId: string;
  children: ReactNode;
}

export default function GoogleOAuthProvider({
  clientId,
  onScriptLoadSuccess,
  onScriptLoadError,
  children,
}: GoogleOAuthProviderProps) {
  const scriptLoadedSuccessfully = useLoadGsiScript({
    onScriptLoadSuccess,
    onScriptLoadError,
  });

  const contextValue = useMemo(
    () => ({
      clientId,
      scriptLoadedSuccessfully,
    }),
    [clientId, scriptLoadedSuccessfully],
  );

  return (
    <GoogleOAuthContext.Provider value={contextValue}>
      {children}
    </GoogleOAuthContext.Provider>
  );
}

export function useGoogleOAuth() {
  const context = useContext(GoogleOAuthContext);
  if (!context) {
    throw new Error(
      "Google OAuth components must be used within GoogleOAuthProvider",
    );
  }
  return context;
}
