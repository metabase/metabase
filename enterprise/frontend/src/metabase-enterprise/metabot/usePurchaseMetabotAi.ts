import { useCallback, useMemo } from "react";

import { usePurchaseCloudAddOnMutation } from "metabase-enterprise/api";

type MetabotAiPurchaseResult = {
  purchaseMetabotAi: () => Promise<void>;
  error: unknown | null;
  isLoading: boolean;
};

export function usePurchaseMetabotAi(
  shouldLoadMetabaseBilling: boolean,
): MetabotAiPurchaseResult {
  const [purchaseCloudAddOn, purchaseCloudAddOnResult] =
    usePurchaseCloudAddOnMutation();

  const purchaseMetabotAi = useCallback(async () => {
    if (!shouldLoadMetabaseBilling) {
      return;
    }

    await purchaseCloudAddOn({
      product_type: "metabase-ai-metered",
      terms_of_service: true,
    }).unwrap();
  }, [purchaseCloudAddOn, shouldLoadMetabaseBilling]);

  return useMemo(
    () => ({
      purchaseMetabotAi,
      error: shouldLoadMetabaseBilling ? purchaseCloudAddOnResult.error : null,
      isLoading: shouldLoadMetabaseBilling
        ? purchaseCloudAddOnResult.isLoading
        : false,
    }),
    [
      purchaseCloudAddOnResult.error,
      purchaseCloudAddOnResult.isLoading,
      purchaseMetabotAi,
      shouldLoadMetabaseBilling,
    ],
  );
}
