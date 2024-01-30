import { t } from "ttag";
import { useAsync } from "react-use";
import { StoreApi } from "metabase/services";
import type { BillingInfo, BillingInfoResponse } from "metabase-types/api";

interface UseBillingInfoState {
  loading: boolean;
  error: string | undefined;
  billingInfo: BillingInfo | undefined;
}

export const useBillingInfo = (): UseBillingInfoState => {
  const response = useAsync<() => Promise<BillingInfoResponse>>(
    StoreApi.billingInfo,
  );

  const errorMessage = response.error
    ? response.error.message ||
      response.error.toString() ||
      t`An error occurred`
    : undefined;

  return {
    loading: response.loading,
    error: errorMessage,
    billingInfo: response.value?.content,
  };
};
