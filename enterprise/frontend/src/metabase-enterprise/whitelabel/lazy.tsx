import { Suspense } from "react";

import { DelayedLoadingSpinner } from "metabase/common/components/DelayedLoading";
import { lazyChunk } from "metabase/utils/lazy-chunk";

/**
 * The whitelabel settings pages, in their own chunk.
 *
 * The branding page renders the colour pickers, which carry `react-color` and
 * its colour helpers. Nothing else on first paint needs them: every other colour
 * picker in the app reaches a lighter part of `ColorPicker`, so these two pages
 * are what held that stack in the shared vendor chunk.
 *
 * `PLUGIN_WHITELABEL` holds components rather than route loaders, so the
 * Suspense boundary lives here rather than at the call site.
 */
const BrandingSettingsPage = lazyChunk(() =>
  import("./components/WhiteLabelBrandingSettingsPage").then(
    ({ WhiteLabelBrandingSettingsPage }) => ({
      default: WhiteLabelBrandingSettingsPage,
    }),
  ),
);

const ConcealSettingsPage = lazyChunk(() =>
  import("./components/WhiteLabelConcealSettingsPage").then(
    ({ WhiteLabelConcealSettingsPage }) => ({
      default: WhiteLabelConcealSettingsPage,
    }),
  ),
);

export const LazyWhiteLabelBrandingSettingsPage = () => (
  <Suspense fallback={<DelayedLoadingSpinner />}>
    <BrandingSettingsPage />
  </Suspense>
);

export const LazyWhiteLabelConcealSettingsPage = () => (
  <Suspense fallback={<DelayedLoadingSpinner />}>
    <ConcealSettingsPage />
  </Suspense>
);
