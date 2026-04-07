import { useCallback, useMemo } from "react";

import { usePurchaseCloudAddOnMutation } from "metabase-enterprise/api";

import { METABASE_MANAGED_AI_PRODUCT_TYPE } from "./constants";

type MetabaseManagedAiPurchaseResult = {
  purchaseMetabaseManagedAi: (hasAcceptedTerms: boolean) => Promise<void>;
  error: unknown | null;
  isLoading: boolean;
};

export function usePurchaseMetabaseManagedAi(
  shouldLoadMetabaseBilling: boolean,
): MetabaseManagedAiPurchaseResult {
  const [purchaseCloudAddOn, purchaseCloudAddOnResult] =
    usePurchaseCloudAddOnMutation();

  const purchaseMetabaseManagedAi = useCallback(
    async (hasAcceptedTerms: boolean) => {
      if (!shouldLoadMetabaseBilling) {
        console.warn(
          "Skipping managed AI purchase because hosted billing is unavailable.",
        );
        return;
      }

      await purchaseCloudAddOn({
        product_type: METABASE_MANAGED_AI_PRODUCT_TYPE,
        terms_of_service: hasAcceptedTerms,
      }).unwrap();
    },
    [purchaseCloudAddOn, shouldLoadMetabaseBilling],
  );

  return useMemo(
    () => ({
      purchaseMetabaseManagedAi,
      error: shouldLoadMetabaseBilling ? purchaseCloudAddOnResult.error : null,
      isLoading: shouldLoadMetabaseBilling
        ? purchaseCloudAddOnResult.isLoading
        : false,
    }),
    [
      purchaseCloudAddOnResult.error,
      purchaseCloudAddOnResult.isLoading,
      purchaseMetabaseManagedAi,
      shouldLoadMetabaseBilling,
    ],
  );
}
