import type { SearchFilterComponent } from "metabase/common/search/types";
import type { State } from "metabase/redux/store";
import type { CollectionEssentials } from "metabase-types/api";

import { definePluginSlot } from "../slot";

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
  // Unjustified type cast. FIXME
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

export const PLUGIN_CONTENT_VERIFICATION = definePluginSlot(
  getDefaultPluginContentVerification,
);
