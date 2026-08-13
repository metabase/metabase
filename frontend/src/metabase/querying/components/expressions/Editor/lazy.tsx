import { Suspense, lazy } from "react";

import { Center, Loader } from "metabase/ui";

import type { EditorProps } from "./Editor";

// The expression editor is only reachable after the user opens the custom
// expression step, so its CodeMirror extensions stay out of the initial bundle.
const importEditor = () =>
  import(
    /* webpackChunkName: "expression-editor" */
    "./Editor"
  );

const LazyEditor = lazy(() =>
  importEditor().then(({ Editor }) => ({ default: Editor })),
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
