import { Suspense, lazy } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";

// Both snippet pages render a CodeMirror editor. They sit behind an enterprise
// plugin that registers eagerly, so without this boundary every EE page load
// pays for the editor.
const LazyNewSnippetPage = lazy(() =>
  import("./NewSnippetPage").then(({ NewSnippetPage }) => ({
    default: NewSnippetPage,
  })),
);

const LazyEditSnippetPage = lazy(() =>
  import("./EditSnippetPage").then(({ EditSnippetPage }) => ({
    default: EditSnippetPage,
  })),
);

export function NewSnippetPage() {
  return (
    <Suspense fallback={<LoadingAndErrorWrapper loading />}>
      <LazyNewSnippetPage />
    </Suspense>
  );
}

export function EditSnippetPage() {
  return (
    <Suspense fallback={<LoadingAndErrorWrapper loading />}>
      <LazyEditSnippetPage />
    </Suspense>
  );
}
