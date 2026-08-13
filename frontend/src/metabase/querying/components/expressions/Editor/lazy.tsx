import { Suspense, lazy } from "react";

import { Center, Loader } from "metabase/ui";

import type { EditorProps } from "./Editor";

// The expression editor is only reachable after the user opens the custom
// expression step, so its CodeMirror extensions stay out of the initial bundle.
const LazyEditor = lazy(() =>
  import(
    /* webpackChunkName: "expression-editor" */
    "./Editor"
  ).then(({ Editor }) => ({ default: Editor })),
);

export function Editor(props: EditorProps) {
  return (
    <Suspense
      fallback={
        <Center h="6rem">
          <Loader size="sm" />
        </Center>
      }
    >
      <LazyEditor {...props} />
    </Suspense>
  );
}
