/**
 * Example: Using Named Themes in React SDK
 *
 * This example demonstrates how to use named themes by passing a string
 * theme name to the MetabaseProvider. The SDK will automatically fetch
 * the theme from the backend API.
 */

import React from "react";

import { MetabaseProvider } from "../components/public/MetabaseProvider";

// Example 1: Using a named theme
export function ExampleWithNamedTheme() {
  return (
    <MetabaseProvider
      authConfig={{
        metabaseInstanceUrl: "http://localhost:3000",
        jwtProviderUri: "http://localhost:9090/sso/metabase",
      }}
      theme="Dark" // Pass theme name as a string
    >
      {/* Your embedded Metabase components */}
      <div>Your dashboard or question components here</div>
    </MetabaseProvider>
  );
}

// Example 2: Using another named theme
export function ExampleWithLightTheme() {
  return (
    <MetabaseProvider
      authConfig={{
        metabaseInstanceUrl: "http://localhost:3000",
        jwtProviderUri: "http://localhost:9090/sso/metabase",
      }}
      theme="Light" // Different theme name
    >
      {/* Your embedded Metabase components */}
      <div>Your dashboard or question components here</div>
    </MetabaseProvider>
  );
}

// Example 3: Still works with direct theme objects
export function ExampleWithDirectTheme() {
  return (
    <MetabaseProvider
      authConfig={{
        metabaseInstanceUrl: "http://localhost:3000",
        jwtProviderUri: "http://localhost:9090/sso/metabase",
      }}
      theme={{
        // Direct theme object still works
        colors: {
          brand: "#9333EA",
        },
      }}
    >
      {/* Your embedded Metabase components */}
      <div>Your dashboard or question components here</div>
    </MetabaseProvider>
  );
}

// Example 4: With custom loader for theme loading
export function ExampleWithCustomLoader() {
  return (
    <MetabaseProvider
      authConfig={{
        metabaseInstanceUrl: "http://localhost:3000",
        jwtProviderUri: "http://localhost:9090/sso/metabase",
      }}
      theme="Dark"
      loaderComponent={() => (
        <div>Loading theme...</div> // Shown while theme is being fetched
      )}
    >
      {/* Your embedded Metabase components */}
      <div>Your dashboard or question components here</div>
    </MetabaseProvider>
  );
}
