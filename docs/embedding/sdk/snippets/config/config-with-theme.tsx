import React from "react";
import {
  MetabaseProvider,
  defineMetabaseAuthConfig,
  defineMetabaseTheme,
} from "@metabase/embedding-sdk-react";

// Configure authentication
const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://metabase.example.com", // Required: Your Metabase instance URL
  authProviderUri: "https://app.example.com/sso/metabase", // Required: An endpoint in your app that signs the user in and returns a session
});

// See the "Customizing appearance" section for more information
const theme = defineMetabaseTheme({
  // Optional: Specify a font to use from the set of fonts supported by Metabase
  fontFamily: "Lato",

  // Optional: Match your application's color scheme
  colors: {
    brand: "#9B5966",
    "text-primary": "#4C5773",
    "text-secondary": "#696E7B",
    "text-tertiary": "#949AAB",
  },
});

export default function App() {
  return (
    <MetabaseProvider
      authConfig={authConfig}
      theme={theme}
      className="optional-class"
    >
      Hello World!
    </MetabaseProvider>
  );
}
