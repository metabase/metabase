declare module "@react-oauth/google" {
  type ComponentType = import("react").ComponentType;

  interface GoogleOAuthProviderProps {
    clientId: string;
  }

  const GoogleOAuthProvider: ComponentType<GoogleOAuthProviderProps>;
}
