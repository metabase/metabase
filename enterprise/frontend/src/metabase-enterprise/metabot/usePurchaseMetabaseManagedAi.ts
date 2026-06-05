import { useCallback, useMemo } from "react";

import { usePurchaseCloudAddOnMutation } from "metabase-enterprise/api";

import { METABASE_MANAGED_AI_PRODUCT_TYPE } from "./constants";

type MetabaseManagedAiPurchaseResult = {
  purchaseMetabaseManagedAi: (hasAcceptedTerms: boolean) => Promise<void>;
  error: unknown | null;
  isLoading: boolean;
};

export function usePurchaseMetabaseManagedAi(): MetabaseManagedAiPurchaseResult {
  const [purchaseCloudAddOn, purchaseCloudAddOnResult] =
    usePurchaseCloudAddOnMutation();

  const purchaseMetabaseManagedAi = useCallback(
    async (hasAcceptedTerms: boolean) => {
      await purchaseCloudAddOn({
        product_type: METABASE_MANAGED_AI_PRODUCT_TYPE,
        terms_of_service: hasAcceptedTerms,
      }).unwrap();
    },
    [purchaseCloudAddOn],
  );

  return useMemo(
    () => ({
      purchaseMetabaseManagedAi,
      error: purchaseCloudAddOnResult.error,
      isLoading: purchaseCloudAddOnResult.isLoading,
    }),
    [
      purchaseCloudAddOnResult.error,
      purchaseCloudAddOnResult.isLoading,
      purchaseMetabaseManagedAi,
    ],
  );
}
