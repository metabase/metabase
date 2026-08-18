import { Suspense, lazy } from "react";

import type { SuggestionPreviewContentProps } from "./SuggestionPreviewContent";

// Metabot chat mounts with the app shell, but this diff preview only renders
// once the user expands a suggested transform. Keeping it lazy keeps CodeMirror
// out of the initial bundle.
const importSuggestionPreviewContent = () =>
  import(
    /* webpackChunkName: "metabot-suggestion-preview" */
    "./SuggestionPreviewContent"
  );

/**
 * The preview's chunk. The message folds this into its own "Loading preview"
 * state, so the diff waits on the data and the chunk together rather than
 * showing a second spinner once the data arrives.
 */
export const loadSuggestionPreview = () => importSuggestionPreviewContent();

const LazySuggestionPreviewContent = lazy(() =>
  importSuggestionPreviewContent().then(({ SuggestionPreviewContent }) => ({
    default: SuggestionPreviewContent,
  })),
);

export const SuggestionPreviewContent = (
  props: SuggestionPreviewContentProps,
) => (
  <Suspense fallback={null}>
    <LazySuggestionPreviewContent {...props} />
  </Suspense>
);
