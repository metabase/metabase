import { ComponentType } from "react";

declare module "@react-oauth/google" {
  interface GoogleOAuthProviderProps {
    clientId: string;
  }

  const GoogleOAuthProvider: ComponentType<GoogleOAuthProviderProps>;
}
