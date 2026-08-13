import { Suspense, lazy } from "react";

import { Center, Loader } from "metabase/ui";

import type { SuggestionPreviewContentProps } from "./SuggestionPreviewContent";

// Metabot chat mounts with the app shell, but this diff preview only renders
// once the user expands a suggested transform. Keeping it lazy keeps CodeMirror
// out of the initial bundle.
const LazySuggestionPreviewContent = lazy(() =>
  import(
    /* webpackChunkName: "metabot-suggestion-preview" */
    "./SuggestionPreviewContent"
  ).then(({ SuggestionPreviewContent }) => ({
    default: SuggestionPreviewContent,
  })),
);

export const SuggestionPreviewContent = (
  props: SuggestionPreviewContentProps,
) => (
  <Suspense
    fallback={
      <Center h="4rem">
        <Loader size="sm" />
      </Center>
    }
  >
    <LazySuggestionPreviewContent {...props} />
  </Suspense>
);
