import { useCallback } from "react";

import { useRemoveCloudAddOnMutation } from "metabase-enterprise/api";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import {
  METABASE_MANAGED_AI_FEATURE,
  METABASE_MANAGED_AI_PRODUCT_TYPE,
  METABASE_TIERED_AI_PRODUCT_TYPE,
  METABOT_V3_FEATURE,
  OFFER_METABASE_MANAGED_AI_FEATURE,
} from "./constants";

export function useOnProviderRemoved() {
  const [removeCloudAddOn] = useRemoveCloudAddOnMutation();

  return useCallback(
    async (providerType: string) => {
      if (providerType !== "metabase") {
        return;
      }

      const hasManagedAi = !!hasPremiumFeature(METABASE_MANAGED_AI_FEATURE);
      const hasDeprecatedAi = !!hasPremiumFeature(METABOT_V3_FEATURE);
      const offersManagedAi = !!hasPremiumFeature(
        OFFER_METABASE_MANAGED_AI_FEATURE,
      );

      const productType = hasManagedAi
        ? METABASE_MANAGED_AI_PRODUCT_TYPE
        : offersManagedAi && hasDeprecatedAi
          ? METABASE_TIERED_AI_PRODUCT_TYPE
          : null;

      if (productType) {
        await removeCloudAddOn({ product_type: productType }).unwrap();
      }
    },
    [removeCloudAddOn],
  );
}
