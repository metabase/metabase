import type { SearchFilterComponent } from "metabase/common/search/types";
import type { State } from "metabase/redux/store";
import type { CollectionEssentials } from "metabase-types/api";

export type ModelFilterControlsProps = any;
export type ModelFilterSettings = {
  verified: boolean;
};

export type MetricFilterControlsProps = any;
export type MetricFilterSettings = {
  verified: boolean;
};

// Stable references so the selectors below return the same object on every
// call. A selector that returns a fresh object literal each time prevents
// reselect/useSelector reference-equality checks from ever short-circuiting,
// since `{ verified: false } !== { verified: false }` in JS -- that forced
// an unnecessary re-render on every state change for any component
// subscribed to these selectors.
const defaultModelFilterSettings: ModelFilterSettings = { verified: false };
const defaultMetricFilterSettings: MetricFilterSettings = { verified: false };

const getDefaultPluginContentVerification = () => ({
  contentVerificationEnabled: false,
  // Unjustified type cast. FIXME
  VerifiedFilter: {} as SearchFilterComponent<"verified">,
  sortCollectionsByVerification: (
    _a: CollectionEssentials,
    _b: CollectionEssentials,
  ) => 0,

  ModelFilterControls: (_props: ModelFilterControlsProps) => null,
  getDefaultModelFilters: (_state: State): ModelFilterSettings =>
    defaultModelFilterSettings,

  getDefaultMetricFilters: (_state: State): MetricFilterSettings =>
    defaultMetricFilterSettings,
  MetricFilterControls: (_props: MetricFilterControlsProps) => null,
});

export const PLUGIN_CONTENT_VERIFICATION =
  getDefaultPluginContentVerification();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(
    PLUGIN_CONTENT_VERIFICATION,
    getDefaultPluginContentVerification(),
  );
}
