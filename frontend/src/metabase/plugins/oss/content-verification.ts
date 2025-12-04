import type { SearchFilterComponent } from "metabase/search/types";
import type { CollectionEssentials } from "metabase-types/api";
import type { State } from "metabase-types/store";

export type ModelFilterControlsProps = any;
export type ModelFilterSettings = {
  verified: boolean;
};

export type MetricFilterControlsProps = any;
export type MetricFilterSettings = {
  verified: boolean;
};

const getDefaultPluginContentVerification = () => ({
  contentVerificationEnabled: false,
  VerifiedFilter: {} as SearchFilterComponent<"verified">,
  sortCollectionsByVerification: (
    _a: CollectionEssentials,
    _b: CollectionEssentials,
  ) => 0,

  ModelFilterControls: (_props: ModelFilterControlsProps) => null,
  getDefaultModelFilters: (_state: State): ModelFilterSettings => ({
    verified: false,
  }),

  getDefaultMetricFilters: (_state: State): MetricFilterSettings => ({
    verified: false,
  }),
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
