import { Suspense, lazy } from "react";

// The plugin is registered at boot, but its page belongs to the lazy Data Studio
// layout. Keep the header and its application controls in that same chunk.
const LazyTransformsUpsellPage = lazy(() =>
  import(/* webpackChunkName: "data-studio" */ "./TransformsUpsellPage").then(
    ({ TransformsUpsellPage }) => ({ default: TransformsUpsellPage }),
  ),
);

export function TransformsUpsellPage() {
  return (
    <Suspense fallback={null}>
      <LazyTransformsUpsellPage />
    </Suspense>
  );
}
