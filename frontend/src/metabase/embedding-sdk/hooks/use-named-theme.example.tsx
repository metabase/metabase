/**
 * Example usage of the useNamedTheme hook
 *
 * This hook fetches a theme by name from the backend API
 * and returns the theme data along with loading and error states.
 */

import React from "react";

import { useNamedTheme } from "./use-named-theme";

export function ExampleComponent() {
  const { theme, isLoading, error } = useNamedTheme("my-custom-theme");

  if (isLoading) {
    return <div>Loading theme...</div>;
  }

  if (error) {
    return <div>Error loading theme: {error.message}</div>;
  }

  if (!theme) {
    return <div>No theme loaded</div>;
  }

  return (
    <div>
      <h1>Theme: {theme.name}</h1>
      <p>Theme ID: {theme.id}</p>
      <pre>{JSON.stringify(theme.settings, null, 2)}</pre>
    </div>
  );
}

export function ExampleWithConditionalLoading({
  themeName,
}: {
  themeName: string | null;
}) {
  // Pass null to skip loading
  const { theme, isLoading, error } = useNamedTheme(themeName);

  if (!themeName) {
    return <div>No theme name provided</div>;
  }

  if (isLoading) {
    return <div>Loading theme...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <div>
      <h1>Loaded theme: {theme?.name}</h1>
      {/* Use theme.settings as MetabaseTheme object */}
      {theme && <div>Brand color: {theme.settings.colors?.brand}</div>}
    </div>
  );
}
